
"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { ref, onValue, off, update, remove, onDisconnect, get, push } from 'firebase/database';
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

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [otherUser, setOtherUser] = useState<{uid: string, displayName: string, photoURL?: string} | null>(null);

  const pc = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  
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
            return;
        }

        const remoteStream = new MediaStream();
        if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
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
        if(otherUserId) {
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
       if(hasHungUp.current) {
           const onDisconnectRef = onDisconnect(ref(db, `calls/${callId}`));
           onDisconnectRef.cancel();
       }
    }
  }, [currentUser, callId, hangUp, otherUser]);


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
    <div className="relative h-screen bg-black text-white overflow-hidden">
      {/* Remote video fills the background */}
      <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
      
      {/* Local video in a picture-in-picture style */}
      <video ref={localVideoRef} autoPlay playsInline muted className={cn("absolute bottom-24 right-6 w-1/4 max-w-xs rounded-lg shadow-lg border-2 border-slate-700 transition-opacity", isVideoOff ? 'opacity-0' : 'opacity-100')} />

      {/* Controls at the bottom */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 flex justify-center">
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
