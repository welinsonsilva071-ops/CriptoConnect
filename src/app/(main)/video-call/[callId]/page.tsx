
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { ref, onValue, off, update, push, get, remove, serverTimestamp } from 'firebase/database';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, PhoneOff, Video, VideoOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

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

export default function VideoCallPage() {
  const [currentUser] = useAuthState(auth);
  const router = useRouter();
  const { callId } = useParams();
  const { toast } = useToast();

  const [callStatus, setCallStatus] = useState<'connecting' | 'ringing' | 'answered' | 'ended'>('connecting');
  const [otherUser, setOtherUser] = useState<OtherUser | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [hasPermissions, setHasPermissions] = useState(true);
  
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const iceCandidateQueue = useRef<RTCIceCandidate[]>([]);


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


  useEffect(() => {
    const callDbRef = ref(db, `calls/${callId}`);

    const callListener = onValue(callDbRef, (snapshot) => {
        if (!snapshot.exists() || snapshot.val().status === 'ended') {
            toast({ title: 'Chamada Encerrada' });
            hangUp();
        }
    });
    
    window.addEventListener('beforeunload', hangUp);

    return () => {
        off(callDbRef, 'value', callListener);
        window.removeEventListener('beforeunload', hangUp);
        // hangUp() foi movido para o listener 'beforeunload' para evitar encerramentos prematuros
    }
  }, [callId, hangUp, toast]);


  useEffect(() => {
    if (!currentUser || !callId) return;

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
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = event.streams[0];
            }
        };

        pc.onicecandidate = event => {
            if (event.candidate) {
                const iceCandidatesRef = ref(db, `calls/${callId}/iceCandidates/${currentUser.uid}`);
                push(iceCandidatesRef, event.candidate.toJSON());
            }
        };

        callListener = onValue(callDbRef, async (snapshot) => {
            if (!snapshot.exists()) return;

            const data = snapshot.val() as CallData;
            setCallStatus(data.status);
            const isCaller = data.callerId === currentUser.uid;
            const otherUserId = isCaller ? data.receiverId : data.callerId;

            if (!otherUser && otherUserId) {
                 get(ref(db, `users/${otherUserId}`)).then(userSnap => {
                    if (userSnap.exists()) setOtherUser({ uid: otherUserId, ...userSnap.val() });
                });
            }

            // --- Signaling Logic ---
            if (pc.signalingState === 'closed') return;
            
            if (data.offer && pc.signalingState === 'stable') { // Receiver logic
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await update(snapshot.ref, { answer, status: 'answered' }); // Status é 'answered' aqui
                iceCandidateQueue.current.forEach(candidate => pc.addIceCandidate(candidate).catch(e => console.error("Error adding queued ICE candidate", e)));
                iceCandidateQueue.current = [];
            } else if (data.answer && pc.signalingState === 'have-local-offer') { // Caller logic
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                iceCandidateQueue.current.forEach(candidate => pc.addIceCandidate(candidate).catch(e => console.error("Error adding queued ICE candidate", e)));
                iceCandidateQueue.current = [];
            }
            
            if (isCaller && !data.offer && pc.signalingState === 'stable') { // Caller creates offer
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                await update(callDbRef, { offer });
            }
            
            if (otherUserId && !iceListeners.find(l => l.id === otherUserId)) {
                const iceRef = ref(db, `calls/${callId}/iceCandidates/${otherUserId}`);
                const iceListener = onValue(iceRef, (iceSnapshot) => {
                    iceSnapshot.forEach((childSnapshot) => {
                        const candidate = new RTCIceCandidate(childSnapshot.val());
                        if (pc.remoteDescription) {
                            pc.addIceCandidate(candidate).catch(e => console.error("Error adding received ICE candidate", e));
                        } else {
                            iceCandidateQueue.current.push(candidate);
                        }
                        remove(childSnapshot.ref);
                    });
                });
                iceListeners.push({ id: otherUserId, ref: iceRef, listener: iceListener });
            }
        });
    };
    
    setupCall();
    
    return () => {
        if (callListener) off(callDbRef, 'value', callListener);
        iceListeners.forEach(({ ref, listener }) => off(ref, 'value', listener));
    }
  }, [currentUser, callId, otherUser, toast]);

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
      <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
      
      <video 
        ref={localVideoRef} 
        autoPlay 
        playsInline 
        muted 
        className={cn(
          "absolute top-4 right-4 w-1/4 max-w-[120px] rounded-lg border-2 border-white shadow-md transition-opacity",
          isVideoOff && "opacity-0"
        )} 
      />

      <div className="absolute top-4 left-4">
        {otherUser && (
            <div className="p-2 bg-black/50 rounded-lg">
                <h1 className="text-xl font-bold">{otherUser.displayName}</h1>
                <p className="text-sm text-gray-300 capitalize">{callStatus}...</p>
            </div>
        )}
      </div>

       {!hasPermissions && (
          <div className="absolute inset-0 flex items-center justify-center p-4 bg-black/70">
            <Alert variant="destructive" className="w-full max-w-sm">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Câmera e Microfone Necessários</AlertTitle>
                <AlertDescription>
                    Por favor, habilite as permissões no seu navegador para continuar.
                </AlertDescription>
            </Alert>
          </div>
       )}

      <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-4">
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

    