
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { ref, onValue, off, update, push, get, remove } from 'firebase/database';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, PhoneOff, Video, VideoOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

type CallData = {
  callerId: string;
  receiverId: string;
  status: 'ringing' | 'answered' | 'ended';
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
};

const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};


export default function VideoCallPage() {
  const [currentUser] = useAuthState(auth);
  const router = useRouter();
  const { callId } = useParams();
  const { toast } = useToast();

  const [callStatus, setCallStatus] = useState<'connecting' | 'ringing' | 'answered' | 'ended'>('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [hasPermissions, setHasPermissions] = useState(true);
  
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
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
      }
    }
    router.push('/');
  }, [callId, currentUser, router]);

  // Effect to listen for call status changes (e.g., ended by other user)
  useEffect(() => {
    if(!callId) return;
    const callDbRef = ref(db, `calls/${callId}`);

    const callStatusListener = onValue(callDbRef, (snapshot) => {
        if ((!snapshot.exists() || snapshot.val().status === 'ended') && !hasHungUp.current) {
            toast({ title: 'Chamada Encerrada' });
            hangUp();
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

    let callListener: any;
    let iceListeners: any[] = [];
    const callDbRef = ref(db, `calls/${callId}`);

    const setupCall = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error("Media permission denied:", error);
        setHasPermissions(false);
        toast({
          variant: 'destructive',
          title: 'Permissões Necessárias',
          description: 'Você precisa permitir o acesso à câmera e ao microfone.'
        });
        return;
      }

      pcRef.current = new RTCPeerConnection(iceServers);
      const pc = pcRef.current;

      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });

      pc.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      pc.onicecandidate = event => {
        if (event.candidate) {
          const iceCandidatesRef = ref(db, `calls/${callId}/iceCandidates/${currentUser.uid}`);
          push(iceCandidatesRef, event.candidate.toJSON());
        }
      };

      // Main signaling logic
      callListener = onValue(callDbRef, async (snapshot) => {
        if (!snapshot.exists()) return;

        const data = snapshot.val() as CallData;
        const pc = pcRef.current;
        if (!pc || pc.signalingState === 'closed') return;

        setCallStatus(data.status);
        const isCaller = data.callerId === currentUser.uid;
        const otherUserId = isCaller ? data.receiverId : data.callerId;
        
        // Receiver Logic
        if (data.offer && !isCaller && pc.signalingState === 'stable') {
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
          if(pc.signalingState === 'have-remote-offer') {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await update(snapshot.ref, { answer, status: 'answered' });
          }
        } 
        // Caller Logic
        else if (data.answer && isCaller && pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
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
         
      // Caller initiates the offer
      const initialCallData = (await get(callDbRef)).val();
      if (initialCallData.callerId === currentUser.uid && !initialCallData.offer && pcRef.current.signalingState === 'stable') {
        const offer = await pcRef.current.createOffer();
        await pcRef.current.setLocalDescription(offer);
        await update(callDbRef, { offer });
      }
    };
    
    setupCall();
    
    return () => {
        if (callListener && callDbRef) off(callDbRef, 'value', callListener);
        iceListeners.forEach(({ ref, listener }) => off(ref, 'value', listener));
    }
  }, [currentUser, callId, toast]);

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

  const toggleVideo = () => {
    setIsVideoOff(current => {
        const newVideoState = !current;
        if (localStreamRef.current) {
            localStreamRef.current.getVideoTracks().forEach(track => {
                track.enabled = !newVideoState;
            });
        }
        return newVideoState;
    });
  };

  return (
    <div className="bg-black h-full flex flex-col text-white relative">
      {/* Remote Video - Full screen background */}
      <video 
          ref={remoteVideoRef} 
          autoPlay 
          playsInline 
          className="w-full h-full object-cover absolute top-0 left-0"
      />
      
      {/* Local Video - Picture-in-picture style */}
      <video 
          ref={localVideoRef} 
          autoPlay 
          playsInline 
          muted 
          className="w-1/4 max-w-[150px] aspect-[9/16] object-cover rounded-lg absolute top-4 right-4 border-2 border-white/50"
      />


       {!hasPermissions && (
          <div className="absolute inset-0 flex items-center justify-center p-4 bg-black/70 z-30">
            <Alert variant="destructive" className="w-full max-w-sm">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Câmera e Microfone Necessários</AlertTitle>
                <AlertDescription>
                    Por favor, habilite as permissões no seu navegador para continuar.
                </AlertDescription>
            </Alert>
          </div>
       )}

      {/* Controls */}
      <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-4 z-20">
        <Button variant="secondary" size="lg" className="rounded-full h-16 w-16 bg-white/20 hover:bg-white/30 backdrop-blur-sm" onClick={toggleMute} disabled={!hasPermissions}>
          {isMuted ? <MicOff /> : <Mic />}
        </Button>
         <Button variant="secondary" size="lg" className="rounded-full h-16 w-16 bg-white/20 hover:bg-white/30 backdrop-blur-sm" onClick={toggleVideo} disabled={!hasPermissions}>
          {isVideoOff ? <VideoOff /> : <Video />}
        </Button>
        <Button variant="destructive" size="lg" className="rounded-full h-16 w-16" onClick={hangUp}>
          <PhoneOff />
        </Button>
      </div>
    </div>
  );
}

    