
"use client";

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { ref, onValue, off, update, get, onChildAdded, push } from 'firebase/database';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { PhoneOff, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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

    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteStreamRef = useRef<MediaStream | null>(null);
    const remoteAudioRef = useRef<HTMLAudioElement>(null);
    const isPeerConnectionClosed = useRef(false);

    const hangUp = () => {
        if (isPeerConnectionClosed.current) return;
        isPeerConnectionClosed.current = true;

        localStreamRef.current?.getTracks().forEach(track => track.stop());
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        if(callData?.status !== 'ended') {
            const callRef = ref(db, `calls/${callId}`);
            update(callRef, { status: 'ended' });
        }
        router.push('/');
    };

    // Initialize WebRTC connection and media streams
    useEffect(() => {
        if (!currentUser) return;

        const initialize = async () => {
            try {
                isPeerConnectionClosed.current = false;
                peerConnectionRef.current = new RTCPeerConnection(configuration);

                localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
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
                        hangUp();
                    }
                };

            } catch (error) {
                console.error("Error initializing WebRTC:", error);
                toast({
                    variant: 'destructive',
                    title: 'Erro de Chamada',
                    description: 'Não foi possível acessar seu microfone. Verifique as permissões.'
                });
                hangUp();
            }
        };

        initialize();

        return () => {
            hangUp();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser, callId]);

    // Handle Firebase signaling
    useEffect(() => {
        if (!callId || !currentUser || !peerConnectionRef.current) return;
        
        const callRef = ref(db, `calls/${callId}`);
        const signalingRef = ref(db, `calls/${callId}/signaling`);
        const iceCandidatesRef = ref(db, `calls/${callId}/iceCandidates`);

        const handleCallState = async (snapshot: any) => {
            const data = snapshot.val() as Call;
            if (!data || data.status === 'rejected' || data.status === 'ended') {
                hangUp();
                return;
            }
            setCallData(data);

            const otherUserId = data.callerId === currentUser.uid ? data.receiverId : data.callerId;
            const otherUserRef = ref(db, `users/${otherUserId}`);
            get(otherUserRef).then(otherUserSnap => {
                if (otherUserSnap.exists()) {
                    setOtherUserInfo(otherUserSnap.val());
                }
            });

            if (data.status === 'answered' && data.callerId === currentUser.uid && !peerConnectionRef.current?.currentRemoteDescription) {
                 try {
                    const offer = await peerConnectionRef.current.createOffer();
                    await peerConnectionRef.current.setLocalDescription(offer);
                    update(signalingRef, { type: 'offer', sdp: offer.sdp });
                 } catch (error) {
                    console.error("Error creating offer:", error);
                 }
            }
        }
        
        const handleSignaling = async (snapshot: any) => {
             if (!peerConnectionRef.current || isPeerConnectionClosed.current) return;
             const data = snapshot.val();
             if (!data) return;

             if (data.type === 'offer' && callData?.receiverId === currentUser.uid) {
                try {
                    await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data));
                    const answer = await peerConnectionRef.current.createAnswer();
                    await peerConnectionRef.current.setLocalDescription(answer);
                    update(signalingRef, { type: 'answer', sdp: answer?.sdp });
                } catch(error) {
                    console.error("Error handling offer:", error);
                }
             } else if (data.type === 'answer' && callData?.callerId === currentUser.uid) {
                try {
                    await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data));
                } catch(error) {
                    console.error("Error handling answer:", error);
                }
             }
        }

        const handleIceCandidates = (otherUserId: string) => {
            peerConnectionRef.current!.onicecandidate = (event) => {
                if (event.candidate) {
                    push(ref(db, `calls/${callId}/iceCandidates/${currentUser.uid}`), event.candidate.toJSON());
                }
            };
            onChildAdded(ref(db, `calls/${callId}/iceCandidates/${otherUserId}`), (snapshot) => {
                if (snapshot.exists()) {
                    const candidate = new RTCIceCandidate(snapshot.val());
                    peerConnectionRef.current?.addIceCandidate(candidate).catch(e => console.error("Error adding ICE candidate", e));
                }
            });
        }
        
        const callListener = onValue(callRef, handleCallState);
        const signalingListener = onValue(signalingRef, handleSignaling);

        get(callRef).then(snapshot => {
            const data = snapshot.val();
            if (data) {
                const otherUserId = data.callerId === currentUser.uid ? data.receiverId : data.callerId;
                handleIceCandidates(otherUserId);
            }
        });

        return () => {
            off(callRef, 'value', callListener);
            off(signalingRef, 'value', signalingListener);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [callId, currentUser, callData?.status]); // Re-run when callData status changes to handle signaling correctly


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
        localStreamRef.current?.getAudioTracks().forEach(track => {
            track.enabled = !track.enabled;
        });
        setIsMuted(!isMuted);
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
        return <div className="flex items-center justify-center min-h-screen">Carregando chamada...</div>;
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
            </div>

            <div className="flex flex-col items-center gap-8">
                 <div className="flex items-center gap-8">
                     <Button variant="ghost" className="h-16 w-16 rounded-full bg-white/10 hover:bg-white/20" onClick={toggleSpeaker}>
                        {isSpeaker ? <Volume2 size={32} /> : <VolumeX size={32} />}
                     </Button>
                     <Button variant="ghost" className="h-16 w-16 rounded-full bg-white/10 hover:bg-white/20" onClick={toggleMute}>
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
