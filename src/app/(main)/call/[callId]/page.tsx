
"use client";

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { ref, onValue, off, update, get, onChildAdded, push, remove } from 'firebase/database';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { PhoneOff, Mic, MicOff, Volume2, VolumeX, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type Call = {
    callerId: string;
    receiverId: string;
    callerInfo: {
        displayName: string;
        photoURL: string;
    };
    status: 'dialing' | 'answered' | 'rejected' | 'ended';
};

type UserInfo = {
    displayName: string;
    photoURL: string;
}

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export default function CallPage() {
    const [currentUser] = useAuthState(auth);
    const router = useRouter();
    const params = useParams();
    const callId = params.callId as string;
    const { toast } = useToast();

    const [callData, setCallData] = useState<Call | null>(null);
    const [otherUserInfo, setOtherUserInfo] = useState<UserInfo | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isSpeaker, setIsSpeaker] = useState(true);
    const [callDuration, setCallDuration] = useState(0);
    const [hasMicPermission, setHasMicPermission] = useState(true);

    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteStreamRef = useRef<MediaStream | null>(null);
    const remoteAudioRef = useRef<HTMLAudioElement>(null);
    const isPeerConnectionClosed = useRef(false);

    // 1. Unified Cleanup Function
    const hangUp = async () => {
        if (isPeerConnectionClosed.current) return;
        isPeerConnectionClosed.current = true;

        localStreamRef.current?.getTracks().forEach(track => track.stop());
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        const callRef = ref(db, `calls/${callId}`);
        const callSnap = await get(callRef);

        if(callSnap.exists() && callSnap.val().status !== 'ended') {
            await update(callRef, { status: 'ended' });
        }

        // Cleanup user's incoming call node
        if (currentUser) {
            const incomingCallRef = ref(db, `users/${currentUser.uid}/incomingCall`);
            remove(incomingCallRef);
        }

        router.push('/');
    };

    // 2. Initialize WebRTC and Media Stream
    useEffect(() => {
        if (!currentUser) return;

        isPeerConnectionClosed.current = false;
        
        const initialize = async () => {
            try {
                // Initialize Peer Connection
                peerConnectionRef.current = new RTCPeerConnection(configuration);

                // Get local media
                localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                setHasMicPermission(true);
                localStreamRef.current.getTracks().forEach(track => {
                    peerConnectionRef.current?.addTrack(track, localStreamRef.current!);
                });

                // Handle remote stream
                peerConnectionRef.current.ontrack = (event) => {
                    remoteStreamRef.current = event.streams[0];
                    if (remoteAudioRef.current) {
                        remoteAudioRef.current.srcObject = remoteStreamRef.current;
                    }
                };

                // Handle ICE connection state
                peerConnectionRef.current.oniceconnectionstatechange = () => {
                    if (peerConnectionRef.current?.iceConnectionState === 'disconnected' ||
                        peerConnectionRef.current?.iceConnectionState === 'closed' ||
                        peerConnectionRef.current?.iceConnectionState === 'failed') {
                        hangUp();
                    }
                };

            } catch (error: any) {
                console.error("Error initializing WebRTC:", error);
                 if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                    setHasMicPermission(false);
                    toast({
                        variant: 'destructive',
                        title: 'Permissão de Microfone Negada',
                        description: 'Por favor, habilite o acesso ao microfone nas configurações do seu navegador para fazer chamadas.'
                    });
                } else {
                    toast({
                        variant: 'destructive',
                        title: 'Erro na Chamada',
                        description: 'Não foi possível acessar seu microfone. Verifique as permissões.'
                    });
                    hangUp();
                }
            }
        };

        initialize();

        return () => {
            hangUp();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser, callId]);

    // 3. Handle Firebase Signaling (dependent on WebRTC initialization)
    useEffect(() => {
        if (!callId || !currentUser) return;
        
        const callRef = ref(db, `calls/${callId}`);
        const signalingRef = ref(db, `calls/${callId}/signaling`);

        const handleCallState = (snapshot: any) => {
            const data = snapshot.val() as Call;
            if (!data) {
                hangUp();
                return;
            }

            setCallData(data);

            if (data.status === 'rejected' || data.status === 'ended') {
                hangUp();
                return;
            }
            
            const otherUserId = data.callerId === currentUser.uid ? data.receiverId : data.callerId;
            const otherUserRef = ref(db, `users/${otherUserId}`);
            get(otherUserRef).then(otherUserSnap => {
                if (otherUserSnap.exists()) {
                    setOtherUserInfo(otherUserSnap.val());
                }
            });

            // Caller creates offer when receiver answers
            if (data.status === 'answered' && data.callerId === currentUser.uid && peerConnectionRef.current && !peerConnectionRef.current.currentRemoteDescription) {
                 peerConnectionRef.current.createOffer()
                    .then(offer => peerConnectionRef.current!.setLocalDescription(offer))
                    .then(() => {
                        update(signalingRef, { type: 'offer', sdp: peerConnectionRef.current!.localDescription?.sdp });
                    }).catch(error => console.error("Error creating offer:", error));
            }
        }
        
        const handleSignaling = async (snapshot: any) => {
             if (!peerConnectionRef.current || isPeerConnectionClosed.current) return;
             const data = snapshot.val();
             if (!data) return;

             try {
                if (data.type === 'offer' && callData?.receiverId === currentUser.uid) {
                    await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data));
                    const answer = await peerConnectionRef.current.createAnswer();
                    await peerConnectionRef.current.setLocalDescription(answer);
                    update(signalingRef, { type: 'answer', sdp: answer?.sdp });
                } else if (data.type === 'answer' && callData?.callerId === currentUser.uid) {
                    if (peerConnectionRef.current.signalingState !== 'closed') {
                      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data));
                    }
                }
             } catch(error) {
                console.error("Error handling signaling message:", error);
             }
        }

        const handleIceCandidates = (otherUserId: string) => {
            if (!peerConnectionRef.current) return;

            peerConnectionRef.current.onicecandidate = (event) => {
                if (event.candidate) {
                    const currentUserIceCandidatesRef = ref(db, `calls/${callId}/iceCandidates/${currentUser.uid}`);
                    push(currentUserIceCandidatesRef, event.candidate.toJSON());
                }
            };

            const otherUserIceCandidatesRef = ref(db, `calls/${callId}/iceCandidates/${otherUserId}`);
            onChildAdded(otherUserIceCandidatesRef, (snapshot) => {
                if (snapshot.exists()) {
                    const candidate = new RTCIceCandidate(snapshot.val());
                    if (peerConnectionRef.current && peerConnectionRef.current.signalingState !== 'closed') {
                      peerConnectionRef.current?.addIceCandidate(candidate).catch(e => console.error("Error adding received ICE candidate", e));
                    }
                }
            });
        }
        
        const callListener = onValue(callRef, handleCallState);
        const signalingListener = onValue(signalingRef, handleSignaling);

        // Get initial call data to set up ICE candidates listener
        get(callRef).then(snapshot => {
            const data = snapshot.val();
            if (data && peerConnectionRef.current) {
                const otherUserId = data.callerId === currentUser.uid ? data.receiverId : data.callerId;
                handleIceCandidates(otherUserId);
            }
        });

        return () => {
            off(callRef, 'value', callListener);
            off(signalingRef, 'value', signalingListener);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [callId, currentUser, callData?.status]);


    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (callData?.status === 'answered') {
            interval = setInterval(() => {
                setCallDuration(prev => prev + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [callData?.status]);


    const toggleMute = () => {
        if (!localStreamRef.current) return;
        localStreamRef.current.getAudioTracks().forEach(track => {
            track.enabled = !track.enabled;
        });
        setIsMuted(prev => !prev);
    };

    const toggleSpeaker = () => {
       if(remoteAudioRef.current){
           remoteAudioRef.current.muted = isSpeaker;
           setIsSpeaker(!isSpeaker);
       }
    };

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    };

    if (!callData || !otherUserInfo) {
        return <div className="flex items-center justify-center min-h-screen bg-slate-800 text-white">Carregando chamada...</div>;
    }

    const isCaller = callData.callerId === currentUser?.uid;

    return (
        <div className="h-full w-full bg-slate-800 text-white flex flex-col items-center justify-between p-8">
             <audio ref={remoteAudioRef} autoPlay playsInline />
            <div className="text-center mt-12">
                <Avatar className="h-32 w-32 mx-auto border-4 border-white/50">
                    <AvatarImage src={otherUserInfo.photoURL} />
                    <AvatarFallback className="text-5xl bg-slate-600">
                        {otherUserInfo.displayName.charAt(0)}
                    </AvatarFallback>
                </Avatar>
                <h1 className="text-3xl font-bold mt-4">{otherUserInfo.displayName}</h1>
                <p className="text-lg text-white/70 mt-1">
                    {callData.status === 'dialing' && (isCaller ? 'Discando...' : 'Recebendo chamada...')}
                    {callData.status === 'answered' && formatDuration(callDuration)}
                </p>
                 {!hasMicPermission && (
                    <Alert variant="destructive" className="mt-4 max-w-sm mx-auto">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Acesso ao Microfone Negado</AlertTitle>
                        <AlertDescription>
                            Por favor, habilite a permissão de microfone nas configurações do seu navegador para continuar.
                        </AlertDescription>
                    </Alert>
                )}
            </div>

            <div className="flex flex-col items-center gap-8">
                 <div className="flex items-center gap-8">
                     <Button variant="ghost" className="h-16 w-16 rounded-full bg-white/10 hover:bg-white/20" onClick={toggleSpeaker}>
                        {isSpeaker ? <Volume2 size={32} /> : <VolumeX size={32} />}
                     </Button>
                     <Button variant="ghost" className="h-16 w-16 rounded-full bg-white/10 hover:bg-white/20" onClick={toggleMute} disabled={!hasMicPermission}>
                        {isMuted ? <MicOff size={32} /> : <Mic size={32} />}
                     </Button>
                 </div>
                <Button
                    variant="destructive"
                    size="lg"
                    className="rounded-full h-20 w-20 p-0"
                    onClick={hangUp}
                >
                    <PhoneOff className="h-10 w-10" />
                </Button>
            </div>
        </div>
    );
}
