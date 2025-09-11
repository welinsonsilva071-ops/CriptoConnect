
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

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const hasHungUp = useRef(false);
  
  const hangUp = useCallback(async () => {
     if (hasHungUp.current) return;
     hasHungUp.current = true;

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
            const callRef = ref(db, `calls/${callId}`);
            const callSnap = await get(callRef);
            if (callSnap.exists() && callSnap.val().status !== 'ended') {
                await update(callRef, { status: 'ended' });
            }
        } catch(e) {
            console.error("Error during hangup update:", e);
        } finally {
           router.push('/');
        }
    } else {
        router.push('/');
    }
  }, [callId, currentUser, router]);

  // Effect to listen for call status changes (e.g., ended by other user)
  useEffect(() => {
    if (!callId) return;
    const callDbRef = ref(db, `calls/${callId}`);

    const callStatusListener = onValue(callDbRef, (snapshot) => {
        if (!snapshot.exists() || snapshot.val().status === 'ended') {
            if (!hasHungUp.current) {
                toast({ title: 'Chamada Encerrada' });
                hangUp();
            }
        }
    });
    
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      hangUp();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
        off(callDbRef, 'value', callStatusListener);
        window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  }, [callId, hangUp, toast]);
  

  // Effect for WebRTC Connection Setup
  useEffect(() => {
    if (!currentUser || !callId || pcRef.current) return;

    const callDbRef = ref(db, `calls/${callId}`);
    let iceListeners: any[] = [];

    const setupCall = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
        stream.getAudioTracks().forEach(track => { track.enabled = !isMuted; });
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

      // Caller initiates the offer
      const initialCallData = (await get(callDbRef)).val();
      if (initialCallData.callerId === currentUser.uid && !initialCallData.offer && pc.signalingState === 'stable') {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await update(callDbRef, { offer });
      }
    };
    
    setupCall();
    
    // Main signaling logic
    const callListener = onValue(callDbRef, async (snapshot) => {
      if (!snapshot.exists()) return;
      
      const data = snapshot.val() as CallData;
      setCallData(data);
      const pc = pcRef.current;
      if (!pc || pc.signalingState === 'closed' || hasHungUp.current) return;
      
      const isCaller = data.callerId === currentUser.uid;
      const otherUserId = isCaller ? data.receiverId : data.callerId;

      if (!otherUser && otherUserId) {
        get(ref(db, `users/${otherUserId}`)).then(userSnap => {
          if (userSnap.exists()) {
            setOtherUser({ uid: otherUserId, ...userSnap.val() });
          }
        });
      }
      
      // Receiver Logic
      if (data.offer && pc.signalingState === 'stable' && !isCaller) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await update(snapshot.ref, { answer, status: 'answered' });
        } catch (e) {
          console.error("Error creating answer: ", e);
        }
      } 
      // Caller Logic
      else if (data.answer && pc.signalingState === 'have-local-offer' && isCaller) {
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (e) {
            console.error("Error setting remote description for answer: ", e);
        }
      }
      
      // ICE Candidate listener
      if (otherUserId && !iceListeners.find(l => l.id === otherUserId)) {
        const iceRef = ref(db, `calls/${callId}/iceCandidates/${otherUserId}`);
        const iceListener = onValue(iceRef, (iceSnapshot) => {
          iceSnapshot.forEach((childSnapshot) => {
            const candidate = new RTCIceCandidate(childSnapshot.val());
            if (pc.remoteDescription) {
              pc.addIceCandidate(candidate).catch(e => console.error("Error adding received ICE candidate", e));
            }
            remove(childSnapshot.ref);
          });
        });
        iceListeners.push({ id: otherUserId, ref: iceRef, listener: iceListener });
      }
    });
    
    return () => {
        off(callDbRef, 'value', callListener);
        iceListeners.forEach(({ ref: iceRef, listener }) => off(iceRef, 'value', listener));
    }
  }, [currentUser, callId, isMuted, toast, otherUser]);


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

  const toggleMute = useCallback(() => {
    setIsMuted(current => {
        const newMutedState = !current;
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(track => {
                track.enabled = !newMutedState;
            });
        }
        return newMutedState;
    });
  }, []);

  const toggleSpeaker = useCallback(() => {
    setIsSpeakerOn(current => {
        const newSpeakerState = !current;
        if (remoteAudioRef.current) {
            remoteAudioRef.current.muted = !newSpeakerState;
        }
        return newSpeakerState;
    });
  }, []);
  
  const DisplayStatus = () => {
    if (!currentUser) {
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
                 <Avatar className="h-32 w-32 mx-auto mb-4 border-4 border-primary animate-pulse">
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


    