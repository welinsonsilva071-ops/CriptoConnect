
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { ref, onValue, off, update, remove, push, get, serverTimestamp } from 'firebase/database';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react';
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
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [hasMicPermission, setHasMicPermission] = useState(true);
  const [isMounted, setIsMounted] = useState(false);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  
  const callRef = useRef(ref(db, `calls/${callId}`));

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const hangUp = useCallback(async (shouldNavigate = true) => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (callId && currentUser) {
      const callSnap = await get(callRef.current);
      if (callSnap.exists() && callSnap.val().status !== 'ended') {
        await update(callRef.current, { status: 'ended' });
        if(callSnap.val().receiverId === currentUser.uid) {
           await remove(ref(db, `users/${currentUser.uid}/incomingCall`));
        }
      }
    }
    if (shouldNavigate) {
      router.push('/');
    }
  }, [callId, currentUser, router]);


  useEffect(() => {
    if (!isMounted || !currentUser || !callId) return;

    let callListener: any;
    let otherIceCandidatesRef: any;
    let iceListener: any;

    const cleanup = () => {
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }
        if (callListener) off(callRef.current, 'value', callListener);
        if (otherIceCandidatesRef && iceListener) off(otherIceCandidatesRef, 'value', iceListener);
    };

    const initialize = async () => {
        try {
            localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            setHasMicPermission(true);
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
        peerConnectionRef.current = pc;
        
        localStreamRef.current.getTracks().forEach(track => {
            pc.addTrack(track, localStreamRef.current!);
        });
        
        remoteStreamRef.current = new MediaStream();
        if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStreamRef.current;
        }

        pc.ontrack = (event) => {
            event.streams[0].getTracks().forEach(track => {
                remoteStreamRef.current?.addTrack(track);
            });
        };
    };

    callListener = onValue(callRef.current, async (snapshot) => {
        const data = snapshot.val() as CallData;
        
        if (!snapshot.exists() || data.status === 'ended') {
            cleanup();
            if (router) router.push('/');
            return;
        }

        setCallData(data);
        const isCaller = data.callerId === currentUser.uid;
        const otherId = isCaller ? data.receiverId : data.callerId;

        if (!otherUser) {
            get(ref(db, `users/${otherId}`)).then(userSnap => {
                if (userSnap.exists()) {
                    setOtherUser({ uid: otherId, ...userSnap.val() });
                }
            });
        }
        
        if (!peerConnectionRef.current) {
            await initialize();
        }
        const pc = peerConnectionRef.current;
        if (!pc) return;

        // Setup ICE candidates listeners only once
        if (!iceListener) {
            const iceCandidatesRef = ref(db, `calls/${callId}/iceCandidates/${currentUser.uid}`);
            otherIceCandidatesRef = ref(db, `calls/${callId}/iceCandidates/${otherId}`);
            
            pc.onicecandidate = event => {
                if (event.candidate) {
                    push(iceCandidatesRef, event.candidate.toJSON());
                }
            };
            iceListener = onValue(otherIceCandidatesRef, (iceSnapshot) => {
                if (iceSnapshot.exists()) {
                    iceSnapshot.forEach((childSnapshot) => {
                         if (pc.signalingState !== 'closed') {
                            pc.addIceCandidate(new RTCIceCandidate(childSnapshot.val())).catch(e => console.error("Error adding ICE", e));
                         }
                        remove(childSnapshot.ref);
                    });
                }
            });
        }

        // State machine for signaling
        if (isCaller && !data.offer && pc.signalingState === 'stable') {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await update(snapshot.ref, { offer: offer });
        }

        if (!isCaller && data.offer && !data.answer) {
             if (pc.signalingState !== 'have-remote-offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
             }
             const answer = await pc.createAnswer();
             await pc.setLocalDescription(answer);
             await update(snapshot.ref, { answer: answer, status: 'answered' });
        }
        
        if (isCaller && data.answer && pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }

    });

    return () => {
      cleanup();
    };

  }, [isMounted, currentUser, callId, hangUp, toast, otherUser, router]);


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
        const sinkId = isSpeaker ? '' : 'speaker';
        // @ts-ignore
        remoteAudioRef.current.setSinkId(sinkId)
        .then(() => setIsSpeaker(prev => !prev))
        .catch(err => console.error("Error changing audio output:", err));
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
        <Button variant="destructive" size="lg" className="rounded-full h-20 w-20" onClick={() => hangUp(true)}>
          <PhoneOff />
        </Button>
        <Button variant="secondary" size="lg" className="rounded-full h-16 w-16" onClick={toggleSpeaker} disabled={!hasMicPermission}>
          <Volume2 />
        </Button>
      </div>
      <audio ref={remoteAudioRef} autoPlay playsInline />
    </div>
  );
}
