
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

        console.log("Hanging up...");

        localStreamRef.current?.getTracks().forEach(track => track.stop());
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        const callRef = ref(db, `calls/${callId}`);
        try {
            const callSnap = await get(callRef);
            if(callSnap.exists() && callSnap.val().status !== 'ended') {
                await update(callRef, { status: 'ended' });
            }
        } catch (e) {
            console.error("Error updating call status on hangup:", e);
        }

        if (currentUser) {
            const incomingCallRef = ref(db, `users/${currentUser.uid}/incomingCall`);
            remove(incomingCallRef).catch(e => console.error("Error removing incoming call node:", e));
        }

        router.push('/');
    };

    // 2. Main useEffect for WebRTC and Firebase Signaling
    useEffect(() => {
        if (!currentUser || !callId) return;

        let callListener: any;
        let signalingListener: any;
        let iceCandidateListenerUnsubscribe: Function | null = null;
        isPeerConnectionClosed.current = false;
        
        const initializeWebRTC = async () => {
            if (peerConnectionRef.current) return; // Already initialized

            try {
                peerConnectionRef.current = new RTCPeerConnection(configuration);

                localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                setHasMicPermission(true);
                localStreamRef.current.getTracks().forEach(track => {
                    if (peerConnectionRef.current) {
                        peerConnectionRef.current.addTrack(track, localStreamRef.current!);
                    }
                });

                peerConnectionRef.current.ontrack = (event) => {
                    remoteStreamRef.current = event.streams[0];
                    if (remoteAudioRef.current) {
                        remoteAudioRef.current.srcObject = remoteStreamRef.current;
                    }
                };

                peerConnectionRef.current.oniceconnectionstatechange = () => {
                    if (peerConnectionRef.current?.iceConnectionState === 'disconnected' ||
                        peerConnectionRef.current?.iceConnectionState === 'closed' ||
                        peerConnectionRef.current?.iceConnectionState === 'failed') {
                        console.log(`ICE state changed to: ${peerConnectionRef.current?.iceConnectionState}. Hanging up.`);
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
                return false;
            }
            return true;
        };

        const setupFirebaseListeners = async () => {
            const callRef = ref(db, `calls/${callId}`);
            const signalingRef = ref(db, `calls/${callId}/signaling`);

            const initialCallSnap = await get(callRef);
            if (!initialCallSnap.exists()) {
                hangUp();
                return;
            }
            const initialCallData = initialCallSnap.val() as Call;
            const otherUserId = initialCallData.callerId === currentUser.uid ? initialCallData.receiverId : initialCallData.callerId;

            // Setup ICE Candidates listeners
            const otherUserIceCandidatesRef = ref(db, `calls/${callId}/iceCandidates/${otherUserId}`);
            const iceListener = onChildAdded(otherUserIceCandidatesRef, (snapshot) => {
                if (snapshot.exists() && peerConnectionRef.current && peerConnectionRef.current.signalingState !== 'closed') {
                    try {
                      const candidate = new RTCIceCandidate(snapshot.val());
                      peerConnectionRef.current.addIceCandidate(candidate).catch(e => console.error("Error adding received ICE candidate", e));
                    } catch(e) {
                      console.error("Failed to add ICE candidate", e)
                    }
                }
            });
            iceCandidateListenerUnsubscribe = () => off(otherUserIceCandidatesRef, 'child_added', iceListener);
            
            if (peerConnectionRef.current) {
                peerConnectionRef.current.onicecandidate = (event) => {
                    if (event.candidate) {
                        const currentUserIceCandidatesRef = ref(db, `calls/${callId}/iceCandidates/${currentUser.uid}`);
                        push(currentUserIceCandidatesRef, event.candidate.toJSON());
                    }
                };
            }


            // Setup Call State listener
            callListener = onValue(callRef, async (snapshot) => {
                const data = snapshot.val() as Call;
                if (!data || data.status === 'rejected' || data.status === 'ended') {
                    hangUp();
                    return;
                }
                setCallData(data);
                
                // Set other user info
                 const otherUserRef = ref(db, `users/${otherUserId}`);
                 get(otherUserRef).then(otherUserSnap => {
                     if (otherUserSnap.exists()) {
                         setOtherUserInfo(otherUserSnap.val());
                     }
                 });


                // Caller creates offer
                if (data.status === 'answered' && data.callerId === currentUser.uid && peerConnectionRef.current && !peerConnectionRef.current.currentRemoteDescription) {
                    try {
                        const offer = await peerConnectionRef.current.createOffer();
                        await peerConnectionRef.current.setLocalDescription(offer);
                        update(signalingRef, { type: 'offer', sdp: peerConnectionRef.current.localDescription?.sdp });
                    } catch (error) {
                         console.error("Error creating offer:", error)
                    }
                }
            });

            // Setup Signaling listener
            signalingListener = onValue(signalingRef, async (snapshot) => {
                 if (!peerConnectionRef.current || isPeerConnectionClosed.current || !snapshot.exists()) return;
                 const data = snapshot.val();
                 if (!data) return;

                 try {
                    const currentCall = callData ?? initialCallData;
                    if (data.type === 'offer' && currentCall?.receiverId === currentUser.uid) {
                        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data));
                        const answer = await peerConnectionRef.current.createAnswer();
                        await peerConnectionRef.current.setLocalDescription(answer);
                        update(signalingRef, { type: 'answer', sdp: answer?.sdp });
                    } else if (data.type === 'answer' && currentCall?.callerId === currentUser.uid) {
                        if (peerConnectionRef.current.signalingState !== 'closed') {
                          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data));
                        }
                    }
                 } catch(error) {
                    console.error("Error handling signaling message:", error);
                 }
            });
        };

        const start = async () => {
            const webrtcInitialized = await initializeWebRTC();
            if(webrtcInitialized) {
                await setupFirebaseListeners();
            }
        }
        
        start();

        return () => {
            hangUp(); // This is the main cleanup
            if (callListener) {
                off(ref(db, `calls/${callId}`), 'value', callListener);
            }
            if (signalingListener) {
                off(ref(db, `calls/${callId}/signaling`), 'value', signalingListener);
            }
            if (iceCandidateListenerUnsubscribe) {
                iceCandidateListenerUnsubscribe();
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser, callId]); // Reruns only if user or callId changes


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


    