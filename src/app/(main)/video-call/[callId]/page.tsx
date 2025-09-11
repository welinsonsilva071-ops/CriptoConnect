
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
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

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


  useEffect(() => {
    const callDbRef = ref(db, `calls/${callId}`);

    const callListener = onValue(callDbRef, (snapshot) => {
        if (!snapshot.exists() || snapshot.val().status === 'ended') {
            toast({ title: 'Chamada Encerrada' });
            hangUp();
        }
    });
    
    const handleBeforeUnload = () => {
      hangUp();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
        off(callDbRef, 'value', callListener);
        window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  }, [callId, hangUp, toast]);


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

        callListener = onValue(callDbRef, async (snapshot) => {
            if (!snapshot.exists()) return;
            
            const pc = pcRef.current;
            if (!pc || pc.signalingState === 'closed') return;

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
            // Receiver: Set remote offer, create answer
            if (data.offer && pc.signalingState === 'stable') {
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await update(snapshot.ref, { answer, status: 'answered' });
                iceCandidateQueue.current.forEach(candidate => pc.addIceCandidate(candidate).catch(e => console.error("Error adding queued ICE candidate", e)));
                iceCandidateQueue.current = [];
            } 
            // Caller: Set remote answer
            else if (data.answer && pc.signalingState === 'have-local-offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                iceCandidateQueue.current.forEach(candidate => pc.addIceCandidate(candidate).catch(e => console.error("Error adding queued ICE candidate", e)));
                iceCandidateQueue.current = [];
            }
            
            // Setup ICE listeners for the other user
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
         
        // Caller: Create offer only after setting up the listener
        get(callDbRef).then(async snapshot => {
            const data = snapshot.val();
            const pc = pcRef.current;
            if (data.callerId === currentUser.uid && !data.offer && pc && pc.signalingState === 'stable') {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                await update(callDbRef, { offer });
            }
        });
    };
    
    setupCall();
    
    return () => {
        if (callListener && callDbRef) off(callDbRef, 'value', callListener);
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
  
  const isCallActive = callStatus === 'answered';

  const VideoPlaceholder = ({user}: {user: OtherUser | null}) => (
     <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-white bg-gray-900">
        {user ? (
            <>
                <Avatar className="h-32 w-32 border-4 border-primary">
                    <AvatarImage src={user?.photoURL} />
                    <AvatarFallback className="text-4xl">{user?.displayName?.charAt(0)}</AvatarFallback>
                </Avatar>
                 <p className="text-lg">Aguardando vídeo...</p>
            </>
        ) : (
            <div className="animate-pulse">
                <div className="h-32 w-32 rounded-full bg-gray-700 mx-auto mb-4"></div>
                <div className="h-8 w-48 bg-gray-700 rounded-md mx-auto"></div>
            </div>
        )}
    </div>
  )

  return (
    <div className="bg-black h-full flex flex-col text-white relative">
      {!isCallActive ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center z-10 bg-black/50">
          {otherUser ? (
              <>
                  <Avatar className="h-32 w-32 border-4 border-primary">
                      <AvatarImage src={otherUser.photoURL} />
                      <AvatarFallback className="text-4xl">{otherUser.displayName.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <h1 className="text-3xl font-bold">{otherUser.displayName}</h1>
              </>
          ) : (
              <div className="animate-pulse">
                  <div className="h-32 w-32 rounded-full bg-gray-700 mx-auto mb-4"></div>
                  <div className="h-8 w-48 bg-gray-700 rounded-md mx-auto"></div>
              </div>
          )}
            <p className="text-lg text-gray-300 capitalize">{callStatus === 'ringing' ? 'Chamando...' : 'Conectando...'}</p>
        </div>
      ) : (
        <>
            {/* Remote Video - Top Half */}
            <div className="w-full h-1/2 bg-black relative">
                <video 
                    ref={remoteVideoRef} 
                    autoPlay 
                    playsInline 
                    className="w-full h-full object-cover" 
                />
                 {!remoteVideoRef.current?.srcObject && <VideoPlaceholder user={otherUser} />}
            </div>

            {/* Local Video - Bottom Half */}
            <div className="w-full h-1/2 bg-black relative">
                 {isVideoOff ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-white bg-gray-900">
                       <Avatar className="h-32 w-32 border-4 border-gray-600">
                           <AvatarImage src={currentUser?.photoURL || undefined} />
                           <AvatarFallback className="text-4xl">{currentUser?.displayName?.charAt(0)}</AvatarFallback>
                       </Avatar>
                       <p className="text-lg">Câmera desligada</p>
                   </div>
                ) : (
                    <video 
                        ref={localVideoRef} 
                        autoPlay 
                        playsInline 
                        muted 
                        className="w-full h-full object-cover"
                    />
                )}
            </div>
        </>
      )}


       {!hasPermissions && (
          <div className="absolute inset-0 flex items-center justify-center p-4 bg-black/70 z-20">
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
      <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-4 z-10">
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

    