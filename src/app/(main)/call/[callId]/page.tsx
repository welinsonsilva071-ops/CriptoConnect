
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { ref, onValue, off, update, remove, push, get } from 'firebase/database';
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
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  
  const callDbRef = useRef(ref(db, `calls/${callId}`));

  const hangUp = useCallback(async () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    
    if (callId && currentUser) {
        const callSnap = await get(callDbRef.current);
        if (callSnap.exists() && callSnap.val().status !== 'ended') {
            await update(callDbRef.current, { status: 'ended' });
        }
    }
    router.push('/');
  }, [callId, currentUser, router]);

  useEffect(() => {
    setIsMounted(true);
    return () => {
        // Cleanup on component unmount
        if (pcRef.current) {
            pcRef.current.close();
        }
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
        }
        off(callDbRef.current);
    }
  }, []);

  useEffect(() => {
    if (!isMounted || !currentUser || !callId) return;
    
    let callListener: any;

    const setupCall = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            localStreamRef.current = stream;
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

        const pc = new RTCPeerConnection(iceServers);
        pcRef.current = pc;

        localStreamRef.current.getTracks().forEach(track => {
            pc.addTrack(track, localStreamRef.current!);
        });

        pc.ontrack = (event) => {
            if (remoteAudioRef.current && event.streams[0]) {
                remoteAudioRef.current.srcObject = event.streams[0];
            }
        };

        callListener = onValue(callDbRef.current, handleCallStateChange);
    };

    const handleCallStateChange = async (snapshot: any) => {
        if (!snapshot.exists()) {
            toast({ title: 'Chamada não encontrada', description: 'Esta chamada não existe mais.'});
            hangUp();
            return;
        }

        const data = snapshot.val() as CallData;
        setCallData(data);

        const pc = pcRef.current;
        if (!pc) return;

        const isCaller = data.callerId === currentUser.uid;
        const otherUserId = isCaller ? data.receiverId : data.callerId;

        if (!otherUser) {
            get(ref(db, `users/${otherUserId}`)).then(userSnap => {
                if (userSnap.exists()) {
                    setOtherUser({ uid: otherUserId, ...userSnap.val() });
                }
            });
        }
        
        if (data.status === 'ended') {
            toast({ title: 'Chamada Encerrada' });
            hangUp();
            return;
        }

        // Setup ICE candidate listeners only once
        if (pc.onicecandidate === null) {
            pc.onicecandidate = event => {
                if (event.candidate) {
                    const iceCandidatesRef = ref(db, `calls/${callId}/iceCandidates/${currentUser.uid}`);
                    push(iceCandidatesRef, event.candidate.toJSON());
                }
            };
        }
        
        const otherIceCandidatesRef = ref(db, `calls/${callId}/iceCandidates/${otherUserId}`);
        onValue(otherIceCandidatesRef, (iceSnapshot) => {
            iceSnapshot.forEach((childSnapshot) => {
                if (pc.signalingState !== 'closed') {
                    pc.addIceCandidate(new RTCIceCandidate(childSnapshot.val())).catch(e => console.error("Error adding received ICE candidate", e));
                }
                remove(childSnapshot.ref);
            });
        });

        // --- Signaling Logic ---
        if (isCaller && !data.offer && pc.signalingState === 'stable') {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await update(snapshot.ref, { offer });
        }
        
        if (!isCaller && data.offer && pc.signalingState === 'have-local-offer') {
             // This case should not happen for the receiver
        } else if (data.offer && pc.signalingState !== 'have-remote-offer' && pc.signalingState !== 'stable') {
            // Wait until the PC is in a state to accept the offer
        }
        
        if (data.offer && pc.signalingState === 'stable') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            if (!isCaller) {
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await update(snapshot.ref, { answer, status: 'answered' });
            }
        }
        
        if (data.answer && pc.signalingState === 'have-remote-offer') {
             await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
    };
    
    setupCall();

    return () => {
        if(callListener) {
            off(callDbRef.current, 'value', callListener);
        }
    };
  }, [isMounted, currentUser, callId, hangUp, toast, router, otherUser]);


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
    if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(track => {
            track.enabled = !track.enabled;
        });
        setIsMuted(prev => !prev);
    }
  };

  const toggleSpeaker = () => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !remoteAudioRef.current.muted;
      setIsSpeakerOn(prev => !prev);
    }
  };
  
  const DisplayStatus = () => {
    if (!isMounted) {
      return <p className="text-muted-foreground mt-2">Conectando...</p>;
    }
    switch (callData?.status) {
      case 'ringing':
        return <p className="text-muted-foreground mt-2">Chamando...</p>;
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
        {otherUser && (
            <>
                <Avatar className="h-32 w-32 mx-auto mb-4 border-4 border-primary">
                    <AvatarImage src={otherUser.photoURL} />
                    <AvatarFallback className="text-4xl">{otherUser.displayName.charAt(0)}</AvatarFallback>
                </Avatar>
                <h1 className="text-3xl font-bold">{otherUser.displayName}</h1>
            </>
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
      
      {/* 
        This audio element is for the remote stream.
        It must have `autoPlay` and `playsInline` to work on most browsers.
        It starts as `muted` to comply with autoplay policies, and `toggleSpeaker` will unmute it.
      */}
      <audio ref={remoteAudioRef} autoPlay playsInline muted />
    </div>
  );
}
    
