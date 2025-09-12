
"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { ref, onValue, off, update, remove, onDisconnect } from 'firebase/database';
import { Button } from '@/components/ui/button';
import { PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

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

export default function VideoCallPage() {
  const [currentUser] = useAuthState(auth);
  const router = useRouter();
  const { callId } = useParams();
  const { toast } = useToast();

  const [callData, setCallData] = useState<CallData | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const pc = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  
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
            localStream.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = localStream.current;
            }
            localStream.current.getTracks().forEach(track => {
                pc.current?.addTrack(track, localStream.current!);
            });
        } catch (error) {
            console.error("Error getting user media", error);
            toast({ variant: 'destructive', title: 'Erro de Mídia', description: 'Não foi possível acessar a câmera ou microfone.' });
            await hangUp();
        }

        remoteStream.current = new MediaStream();
        if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream.current;
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
        
        // Setting remote description for receiver
        if (!isCaller && data.offer && pc.current?.signalingState === 'stable') {
            await pc.current.setRemoteDescription(new RTCSessionDescription(data.offer));
        }

        // Receiver creates answer
        if (!isCaller && data.offer && pc.current?.signalingState === 'have-remote-offer') {
            const answerDescription = await pc.current.createAnswer();
            await pc.current.setLocalDescription(answerDescription);
            await update(callRef, { answer: { sdp: answerDescription.sdp, type: answerDescription.type } });
        }

        // Setting remote description for caller
        if (isCaller && data.answer && pc.current?.signalingState === 'have-local-offer') {
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
                    const candidate = new RTCIceCandidate({ candidate: childSnapshot.key, sdpMid: 'video', sdpMLineIndex: 0 });
                    pc.current?.addIceCandidate(candidate).catch(e => console.error("Error adding ICE candidate (video)", e));
                    const candidateAudio = new RTCIceCandidate({ candidate: childSnapshot.key, sdpMid: 'audio', sdpMLineIndex: 1 });
                    pc.current?.addIceCandidate(candidateAudio).catch(e => console.error("Error adding ICE candidate (audio)", e));
                });
            }
        });
    }

    return () => {
        unsubscribe();
        iceUnsubscribe?.();
    }
  }, [currentUser, callId, hangUp, callData]);


  const toggleMute = () => {
    localStream.current?.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
        setIsMuted(!track.enabled);
    });
  };
  
  const toggleVideo = () => {
    localStream.current?.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
        setIsVideoOff(!track.enabled);
    });
  };

  return (
    <div className="relative h-full bg-black text-white">
      <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
      <video ref={localVideoRef} autoPlay playsInline muted className={cn("absolute bottom-24 right-6 w-1/4 max-w-xs rounded-lg shadow-lg border-2 border-slate-700 transition-opacity", isVideoOff ? 'opacity-0' : 'opacity-100')} />

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-6 flex justify-center">
        <div className="flex items-center gap-4">
            <Button variant="ghost" size="lg" className="rounded-full h-16 w-16 text-white hover:bg-white/10 hover:text-white" onClick={toggleMute}>
                {isMuted ? <MicOff /> : <Mic />}
            </Button>
            <Button variant="ghost" size="lg" className="rounded-full h-16 w-16 text-white hover:bg-white/10 hover:text-white" onClick={toggleVideo}>
                {isVideoOff ? <VideoOff /> : <Video />}
            </Button>
            <Button variant="destructive" size="lg" className="rounded-full h-16 w-16" onClick={hangUp}>
                <PhoneOff />
            </Button>
        </div>
      </div>
    </div>
  );
}
