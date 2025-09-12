
"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { ref, onValue, off, update, remove, onDisconnect } from 'firebase/database';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { PhoneOff, Mic, MicOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const servers = {
  iceServers: [
    { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
  ],
  iceCandidatePoolSize: 10,
};

type CallData = {
  caller: { uid: string; displayName: string; photoURL?: string };
  receiver: { uid: string; displayName: string; photoURL?: string };
  status: 'ringing' | 'answered' | 'ended' | 'declined';
  offer?: { sdp: string; type: string };
  answer?: { sdp: string; type:string };
};

export default function VoiceCallPage() {
  const [currentUser] = useAuthState(auth);
  const router = useRouter();
  const { callId } = useParams();
  const { toast } = useToast();

  const [callData, setCallData] = useState<CallData | null>(null);
  const [otherUser, setOtherUser] = useState<{ displayName: string; photoURL?: string} | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const pc = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const hasHungUp = useRef(false);
  
  const hangUp = useCallback(async () => {
    if (hasHungUp.current) return;
    hasHungUp.current = true;

    if (pc.current) {
        pc.current.getTransceivers().forEach(transceiver => transceiver.stop());
        pc.current.close();
        pc.current = null;
    }
    if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop());
        localStream.current = null;
    }

    if (currentUser) {
        const callRef = ref(db, `calls/${callId}`);
        await update(callRef, { status: 'ended' });
        
        const otherUserId = callData?.caller.uid === currentUser.uid ? callData?.receiver.uid : callData?.caller.uid;
        if(otherUserId) {
            await remove(ref(db, `users/${otherUserId}/incomingCall`));
        }
    }

    toast({ title: "Chamada Encerrada" });
    router.push('/');
  }, [callId, currentUser, router, toast, callData]);


  // Initialize Peer Connection and Media Streams
  useEffect(() => {
    const initialize = async () => {
        if (!currentUser || !callId) return;

        pc.current = new RTCPeerConnection(servers);

        try {
            localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            localStream.current.getTracks().forEach(track => {
                pc.current?.addTrack(track, localStream.current!);
            });
        } catch (error) {
            console.error("Error getting user media", error);
            toast({ variant: 'destructive', title: 'Erro de áudio', description: 'Não foi possível acessar o microfone.' });
            await hangUp();
        }

        remoteStream.current = new MediaStream();
        if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream.current;
        }

        pc.current.ontrack = (event) => {
            event.streams[0].getTracks().forEach(track => {
                remoteStream.current?.addTrack(track);
            });
        };

        pc.current.onicecandidate = (event) => {
            if (event.candidate) {
                update(ref(db, `calls/${callId}/iceCandidates/${currentUser.uid}`), { [event.candidate.candidate]: true });
            }
        };

        const callRef = ref(db, `calls/${callId}`);
        onDisconnect(callRef).update({ status: 'ended' });
    };

    initialize();
    
    return () => {
       if (pc.current) {
           pc.current.close();
           pc.current = null;
       }
       if (localStream.current) {
           localStream.current.getTracks().forEach(track => track.stop());
           localStream.current = null;
       }
    }
  }, [currentUser, callId, toast, hangUp]);


  // Signaling logic
  useEffect(() => {
    if (!currentUser || !callId || !pc.current) return;

    const callRef = ref(db, `calls/${callId}`);
    
    const unsubscribe = onValue(callRef, async (snapshot) => {
        if (!snapshot.exists()) {
            await hangUp();
            return;
        }
        
        const data: CallData = snapshot.val();
        setCallData(data);

        const isCaller = data.caller.uid === currentUser.uid;
        setOtherUser(isCaller ? data.receiver : data.caller);

        if (data.status === 'ended' || data.status === 'declined') {
            await hangUp();
            return;
        }

        // Caller creates offer
        if (isCaller && !data.offer && pc.current?.signalingState === 'stable') {
            const offerDescription = await pc.current.createOffer();
            await pc.current.setLocalDescription(offerDescription);
            await update(callRef, { offer: { sdp: offerDescription.sdp, type: offerDescription.type }});
        }

        // Receiver creates answer
        if (!isCaller && data.offer && pc.current?.signalingState === 'have-remote-offer') {
            const answerDescription = await pc.current.createAnswer();
            await pc.current.setLocalDescription(answerDescription);
            await update(callRef, { answer: { sdp: answerDescription.sdp, type: answerDescription.type } });
        }
        
        // Setting remote description
        if (data.offer && pc.current?.signalingState === 'stable') {
            await pc.current.setRemoteDescription(new RTCSessionDescription(data.offer));
        }

        if (data.answer && pc.current?.signalingState === 'have-local-offer') {
            await pc.current.setRemoteDescription(new RTCSessionDescription(data.answer));
            await update(callRef, { status: 'answered' });
        }
    });

    const otherUserId = callData?.caller.uid === currentUser.uid ? callData?.receiver.uid : callData?.caller.uid;
    let iceUnsubscribe: () => void;

    if (otherUserId) {
        const iceRef = ref(db, `calls/${callId}/iceCandidates/${otherUserId}`);
        iceUnsubscribe = onValue(iceRef, (snapshot) => {
            if (snapshot.exists()) {
                snapshot.forEach(childSnapshot => {
                    const candidate = new RTCIceCandidate({ candidate: childSnapshot.key, sdpMid: 'audio', sdpMLineIndex: 0 });
                    pc.current?.addIceCandidate(candidate).catch(e => console.error("Error adding ICE candidate", e));
                });
            }
        });
    }

    return () => {
        unsubscribe();
        iceUnsubscribe?.();
    }
  }, [currentUser, callId, hangUp, callData]);


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
    if (localStream.current) {
        localStream.current.getAudioTracks().forEach(track => {
            track.enabled = !track.enabled;
            setIsMuted(!track.enabled);
        });
    }
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return seconds > 3600 ? `${h}:${m}:${s}` : `${m}:${s}`;
  };

  if (!otherUser) {
    return <div className="flex items-center justify-center h-full bg-black text-white">Carregando chamada...</div>;
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white">
      <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
        <Avatar className="h-32 w-32 border-4 border-slate-700">
          <AvatarImage src={otherUser.photoURL} alt={otherUser.displayName} />
          <AvatarFallback className="text-5xl bg-slate-800">{otherUser.displayName?.charAt(0)}</AvatarFallback>
        </Avatar>
        <h2 className="text-3xl font-bold">{otherUser.displayName}</h2>
        <p className="text-slate-400">
          {callData?.status === 'ringing' && 'Chamando...'}
          {callData?.status === 'answered' && `Em chamada: ${formatDuration(callDuration)}`}
        </p>
      </div>

      <div className="bg-slate-800/50 p-4 flex justify-around items-center">
        <Button variant="ghost" size="lg" className="rounded-full h-16 w-16" onClick={toggleMute}>
          {isMuted ? <MicOff /> : <Mic />}
        </Button>
        <Button variant="destructive" size="lg" className="rounded-full h-16 w-16" onClick={hangUp}>
          <PhoneOff />
        </Button>
      </div>
      <audio ref={remoteAudioRef} autoPlay playsInline />
    </div>
  );
}
