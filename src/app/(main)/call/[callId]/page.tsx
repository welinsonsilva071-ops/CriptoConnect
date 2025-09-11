
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { ref, onValue, off, update, remove, push, get, serverTimestamp } from 'firebase/database';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, PhoneOff, Volume2, VolumeX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

type CallData = {
  callerId: string;
  receiverId: string;
  status: 'ringing' | 'answered' | 'ended';
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
};

type OtherUser = {
    uid: string;
    displayName: string;
    photoURL?: string;
}

export default function CallPage() {
  const [currentUser] = useAuthState(auth);
  const router = useRouter();
  const { callId } = useParams();
  const { toast } = useToast();

  const [callData, setCallData] = useState<CallData | null>(null);
  const [otherUser, setOtherUser] = useState<OtherUser | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [hasMicPermission, setHasMicPermission] = useState(true);
  const [isMounted, setIsMounted] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const callDbRef = useRef(ref(db, `calls/${callId}`));
  const iceCandidateQueue = useRef<RTCIceCandidate[]>([]);


  const hangUp = useCallback(async () => {
    if (pcRef.current) {
        if (pcRef.current.signalingState !== 'closed') {
            pcRef.current.close();
        }
        pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    
    if (callId && currentUser) {
        try {
            const callSnap = await get(callDbRef.current);
            if (callSnap.exists() && callSnap.val().status !== 'ended') {
                await update(callDbRef.current, { status: 'ended' });
            }
        } catch(e) {
            console.error("Error during hangup update:", e);
        }
    }
    if (!router.asPath.startsWith('/messages')) {
       router.push('/');
    }
  }, [callId, currentUser, router]);

  useEffect(() => {
    setIsMounted(true);
    let callListener: any;
    let iceListeners: any[] = [];
  
    const cleanup = () => {
        if (callListener && callDbRef.current) {
            off(callDbRef.current, 'value', callListener);
        }
        iceListeners.forEach(({ ref, listener }) => {
            if(ref) off(ref, 'value', listener);
        });
        iceListeners = [];
    
        if (pcRef.current && pcRef.current.signalingState !== 'closed') {
            pcRef.current.close();
        }
        pcRef.current = null;
    
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }
    };
  
    // Add this to handle user leaving the page
    window.addEventListener('beforeunload', hangUp);

    return () => {
        window.removeEventListener('beforeunload', hangUp);
        cleanup();
    }
  }, [hangUp]);
  

  useEffect(() => {
    if (!isMounted || !currentUser || !callId) return;

    let callValueListener: any;
    let iceValueListeners: { ref: any, listener: any }[] = [];

    const setupCall = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            localStreamRef.current = stream;
            stream.getAudioTracks().forEach(track => {
                track.enabled = !isMuted;
            });
        } catch (error) {
            console.error("Mic permission denied:", error);
            setHasMicPermission(false);
            toast({
                variant: 'destructive',
                title: 'Permissão de Microfone Negada',
                description: 'Você precisa permitir o acesso ao microfone para fazer chamadas.'
            });
            return;
        }

        pcRef.current = new RTCPeerConnection(iceServers);
        const pc = pcRef.current;

        localStreamRef.current.getTracks().forEach(track => {
            pc.addTrack(track, localStreamRef.current!);
        });

        pc.ontrack = (event) => {
            if (remoteAudioRef.current && event.streams[0]) {
                remoteAudioRef.current.srcObject = event.streams[0];
            }
        };

        pc.onicecandidate = event => {
            if (event.candidate) {
                const iceCandidatesRef = ref(db, `calls/${callId}/iceCandidates/${currentUser.uid}`);
                push(iceCandidatesRef, event.candidate.toJSON());
            }
        };

        callValueListener = onValue(callDbRef.current, async (snapshot) => {
            if (!snapshot.exists()) {
                toast({ title: 'Chamada não encontrada', description: 'Esta chamada não existe mais.'});
                hangUp();
                return;
            }

            const data = snapshot.val() as CallData;
            setCallData(data);
            const isCaller = data.callerId === currentUser.uid;
            const otherUserId = isCaller ? data.receiverId : data.callerId;

            if (!otherUser && otherUserId) {
                 get(ref(db, `users/${otherUserId}`)).then(userSnap => {
                    if (userSnap.exists()) {
                        setOtherUser({ uid: otherUserId, ...userSnap.val() });
                    }
                });
            }

            if (data.status === 'ended' && pc.signalingState !== 'closed') {
                toast({ title: 'Chamada Encerrada' });
                hangUp();
                return;
            }

            // --- Signaling Logic ---
            if (data.offer && pc.signalingState === 'stable') { // Receiver side
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await update(snapshot.ref, { answer, status: 'answered' });
                
                // Process any queued candidates now that remote description is set
                iceCandidateQueue.current.forEach(candidate => pc.addIceCandidate(candidate).catch(e => console.error("Error adding queued ICE candidate", e)));
                iceCandidateQueue.current = [];

            } else if (data.answer && pc.signalingState === 'have-local-offer') { // Caller side
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));

                 // Process any queued candidates now that remote description is set
                 iceCandidateQueue.current.forEach(candidate => pc.addIceCandidate(candidate).catch(e => console.error("Error adding queued ICE candidate", e)));
                 iceCandidateQueue.current = [];
            }
            
            // If I am the caller and there's no offer, create one.
            if (isCaller && !data.offer) {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                await update(callDbRef.current, { offer });
            }

             // Setup ICE listeners for the other user if not already done
            if (otherUserId && !iceValueListeners.find(l => l.ref.toString().includes(otherUserId))) {
                const otherIceCandidatesRef = ref(db, `calls/${callId}/iceCandidates/${otherUserId}`);
                const iceListener = onValue(otherIceCandidatesRef, (iceSnapshot) => {
                    iceSnapshot.forEach((childSnapshot) => {
                        const candidate = new RTCIceCandidate(childSnapshot.val());
                        if (pc.remoteDescription) {
                            pc.addIceCandidate(candidate).catch(e => console.error("Error adding received ICE candidate", e));
                        } else {
                            // Queue candidate if remote description is not set yet
                            iceCandidateQueue.current.push(candidate);
                        }
                        remove(childSnapshot.ref);
                    });
                });
                iceValueListeners.push({ ref: otherIceCandidatesRef, listener: iceListener });
            }
        });
    };
    
    setupCall();
    
    return () => {
        if (callValueListener) off(callDbRef.current, 'value', callValueListener);
        iceValueListeners.forEach(({ ref, listener }) => off(ref, 'value', listener));
    }

  }, [isMounted, currentUser, callId, hangUp, toast]);


  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (callData?.status === 'answered') {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callData?.status]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const toggleMute = () => {
    setIsMuted(current => {
        const newMutedState = !current;
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(track => {
                track.enabled = !newMutedState;
            });
        }
        return newMutedState;
    });
  };

  const toggleSpeaker = () => {
    setIsSpeakerOn(current => {
        const newSpeakerState = !current;
        if (remoteAudioRef.current) {
            remoteAudioRef.current.muted = !newSpeakerState;
        }
        return newSpeakerState;
    });
  };
  
  const DisplayStatus = () => {
    if (!isMounted) {
      return <p className="text-muted-foreground mt-2">Conectando...</p>;
    }
    switch (callData?.status) {
      case 'ringing':
        const isCaller = callData?.callerId === currentUser?.uid;
        return <p className="text-muted-foreground mt-2">{isCaller ? 'Chamando...' : 'Recebendo chamada...'}</p>;
      case 'answered':
        return <p className="text-muted-foreground mt-2">{formatDuration(callDuration)}</p>;
      case 'ended':
        return <p className="text-muted-foreground mt-2">Chamada encerrada</p>;
      default:
        return <p className="text-muted-foreground mt-2">Conectando...</p>;
    }
  };

  return (
    <div className="bg-background h-full flex flex-col justify-between items-center text-center p-8">
      <div>
        {otherUser ? (
            <>
                <Avatar className="h-32 w-32 mx-auto mb-4 border-4 border-primary">
                    <AvatarImage src={otherUser.photoURL} />
                    <AvatarFallback className="text-4xl">{otherUser.displayName.charAt(0)}</AvatarFallback>
                </Avatar>
                <h1 className="text-3xl font-bold">{otherUser.displayName}</h1>
            </>
        ) : (
            <div className="flex flex-col items-center">
                 <Avatar className="h-32 w-32 mx-auto mb-4 border-4 border-primary">
                    <AvatarFallback className="text-4xl">?</AvatarFallback>
                </Avatar>
                 <h1 className="text-3xl font-bold">Carregando...</h1>
            </div>
        )}
        <DisplayStatus />
      </div>

       {!hasMicPermission && (
          <Alert variant="destructive" className="w-full max-w-sm">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Microfone Necessário</AlertTitle>
            <AlertDescription>
                Por favor, habilite a permissão do microfone nas configurações do seu navegador para continuar.
            </AlertDescription>
          </Alert>
       )}


      <div className="flex items-center justify-center gap-4">
        <Button variant="secondary" size="lg" className="rounded-full h-16 w-16" onClick={toggleMute} disabled={!hasMicPermission}>
          {isMuted ? <MicOff /> : <Mic />}
        </Button>
        <Button variant="destructive" size="lg" className="rounded-full h-20 w-20" onClick={hangUp}>
          <PhoneOff />
        </Button>
        <Button variant="secondary" size="lg" className="rounded-full h-16 w-16" onClick={toggleSpeaker} disabled={!hasMicPermission}>
          {isSpeakerOn ? <Volume2 /> : <VolumeX />}
        </Button>
      </div>
      
      <audio ref={remoteAudioRef} autoPlay playsInline muted={!isSpeakerOn} />
    </div>
  );
}
    

    