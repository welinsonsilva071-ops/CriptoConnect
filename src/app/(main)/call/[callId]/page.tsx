
"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { ref, onValue, off, update, remove, onDisconnect, get, push } from 'firebase/database';
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

type CallParticipant = {
    uid: string;
    displayName: string;
    photoURL?: string;
}

export default function VoiceCallPage() {
  const [currentUser] = useAuthState(auth);
  const router = useRouter();
  const { callId } = useParams();
  const { toast } = useToast();

  const [callStatus, setCallStatus] = useState<'ringing' | 'answered' | 'ended' | 'declined'>('ringing');
  const [otherUser, setOtherUser] = useState<CallParticipant | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const pc = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
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
    
    if (callId && currentUser) {
      const callRef = ref(db, `calls/${callId}`);
      const callSnap = await get(callRef);
      if(callSnap.exists()){
        const callData = callSnap.val() as CallData;
        
        await update(callRef, { status: 'ended' });
        
        const otherUserId = callData?.caller.uid === currentUser.uid ? callData?.receiver.uid : callData?.caller.uid;
        if(otherUserId) {
            await remove(ref(db, `users/${otherUserId}/incomingCall`));
        }
      }
    }

    toast({ title: "Chamada Encerrada" });
    router.push('/');
  }, [callId, currentUser, router, toast]);

  useEffect(() => {
    if (!currentUser || !callId) return;

    let callRef: any;
    let callListener: any;
    let iceCandidatesListener: any;

    const setup = async () => {
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
            return;
        }

        const remoteStream = new MediaStream();
        if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.play().catch(e => console.error("Remote audio play failed", e));
        }

        pc.current.ontrack = (event) => {
            event.streams[0].getTracks().forEach(track => {
                remoteStream.addTrack(track);
            });
        };
        
        callRef = ref(db, `calls/${callId}`);
        const onDisconnectRef = onDisconnect(callRef);
        onDisconnectRef.update({ status: 'ended' });

        callListener = onValue(callRef, async (snapshot) => {
            if (!snapshot.exists()) {
                await hangUp();
                return;
            }
            
            const data: CallData = snapshot.val();
            setCallStatus(data.status);

            const isCaller = data.caller.uid === currentUser.uid;
            const otherUserData = isCaller ? data.receiver : data.caller;
            if(!otherUser) setOtherUser(otherUserData);

            if (data.status === 'ended' || data.status === 'declined') {
                await hangUp();
                return;
            }

            const peerConnection = pc.current!;

            if (isCaller && !data.offer) {
                const offerDescription = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offerDescription);
                await update(callRef, { offer: { sdp: offerDescription.sdp, type: offerDescription.type }});
            }

            if (!isCaller && data.offer && peerConnection.signalingState === 'stable') {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answerDescription = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answerDescription);
                await update(callRef, { answer: { sdp: answerDescription.sdp, type: answerDescription.type }, status: 'answered' });
            }
            
            if (isCaller && data.answer && peerConnection.signalingState === 'have-local-offer') {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            }
        });

        // ICE candidates logic
        const otherUserId = otherUser?.uid || (await get(callRef)).val()?.receiver.uid;
        if (otherUserId) {
            const iceCandidatesRef = ref(db, `calls/${callId}/iceCandidates/${currentUser.uid}`);
            pc.current.onicecandidate = (event) => {
                if (event.candidate) {
                    push(iceCandidatesRef, event.candidate.toJSON());
                }
            };
            
            const remoteIceCandidatesRef = ref(db, `calls/${callId}/iceCandidates/${otherUserId}`);
            iceCandidatesListener = onValue(remoteIceCandidatesRef, (snapshot) => {
                if (snapshot.exists()) {
                    snapshot.forEach(childSnapshot => {
                        const candidate = new RTCIceCandidate(childSnapshot.val());
                        pc.current?.addIceCandidate(candidate).catch(e => console.error("Error adding ICE candidate", e));
                    });
                }
            });
        }
    };

    setup();
    
    return () => {
       if (callRef) off(callRef, 'value', callListener);
       if (iceCandidatesListener) off(ref(db, `calls/${callId}/iceCandidates`), 'value', iceCandidatesListener);
       if (hasHungUp.current) {
         const onDisconnectRef = onDisconnect(ref(db, `calls/${callId}`));
         onDisconnectRef.cancel();
       }
    }
  }, [currentUser, callId, hangUp, otherUser]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (callStatus === 'answered') {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [callStatus]);


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
    return seconds >= 3600 ? `${h}:${m}:${s}` : `${m}:${s}`;
  };

  if (!otherUser) {
    return <div className="flex items-center justify-center h-screen bg-slate-900 text-white">Carregando chamada...</div>;
  }

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-white">
      <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 pt-16">
        <Avatar className="h-32 w-32 border-4 border-slate-700">
          <AvatarImage src={otherUser.photoURL || undefined} alt={otherUser.displayName} />
          <AvatarFallback className="text-5xl bg-slate-800">{otherUser.displayName?.charAt(0)}</AvatarFallback>
        </Avatar>
        <h2 className="text-3xl font-bold">{otherUser.displayName}</h2>
        <p className="text-slate-400 h-6">
          {callStatus === 'ringing' && 'Chamando...'}
          {callStatus === 'answered' && `Em chamada: ${formatDuration(callDuration)}`}
        </p>
      </div>

      <div className="bg-slate-800/50 p-4 pb-8 flex justify-around items-center">
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
