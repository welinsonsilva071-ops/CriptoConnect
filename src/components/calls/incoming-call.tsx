
"use client";

import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { ref, update, remove } from 'firebase/database';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type IncomingCallData = {
  callId: string;
  caller: {
    uid: string;
    displayName: string;
    photoURL?: string;
  };
  type: 'voice' | 'video';
};

export default function IncomingCall({ call }: { call: IncomingCallData }) {
  const router = useRouter();
  const [currentUser] = useAuthState(auth);
  const { toast } = useToast();

  const handleAccept = async () => {
    if (!currentUser) return;
    
    try {
      // First remove the incoming call marker
      await remove(ref(db, `users/${currentUser.uid}/incomingCall`));

      // Then update the call status
      const callRef = ref(db, `calls/${call.callId}`);
      await update(callRef, { status: 'answered' });

      if (call.type === 'voice') {
        router.push(`/call/${call.callId}`);
      } else {
        router.push(`/video-call/${call.callId}`);
      }
    } catch (error) {
      console.error("Error accepting call: ", error);
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível atender a chamada.'})
    }
  };

  const handleDecline = async () => {
    if (!currentUser) return;

    try {
      // First remove the incoming call marker
      await remove(ref(db, `users/${currentUser.uid}/incomingCall`));
      
      // Then update the call status
      const callRef = ref(db, `calls/${call.callId}`);
      await update(callRef, { status: 'declined' });
    } catch (error) {
       console.error("Error declining call: ", error);
       toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível recusar a chamada.'})
    }
  };

  if (!call.caller) {
    return null; // Don't render if caller info is not yet available
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm text-center animate-in fade-in-0 zoom-in-95">
        <CardHeader>
          <Avatar className="h-24 w-24 mx-auto mb-4 border-4 border-primary">
            <AvatarImage src={call.caller.photoURL || undefined} alt={call.caller.displayName} />
            <AvatarFallback className="text-4xl">{call.caller.displayName.charAt(0)}</AvatarFallback>
          </Avatar>
          <CardTitle>{call.caller.displayName}</CardTitle>
          <CardDescription>
            {call.type === 'voice' ? 'Chamada de voz...' : 'Chamada de vídeo...'}
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex justify-around">
          <Button variant="destructive" size="lg" className="rounded-full h-16 w-16" onClick={handleDecline}>
            <PhoneOff />
          </Button>
          <Button variant="default" size="lg" className="rounded-full h-16 w-16 bg-green-500 hover:bg-green-600" onClick={handleAccept}>
            {call.type === 'voice' ? <Phone /> : <Video />}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
