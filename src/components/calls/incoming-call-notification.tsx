
"use client";

import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { ref, update, remove } from 'firebase/database';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';

export type Call = {
  id: string;
  callerId: string;
  receiverId: string;
  status: 'ringing' | 'answered' | 'ended';
  caller: {
    displayName: string;
    photoURL?: string;
  }
};

type IncomingCallNotificationProps = {
  call: Call;
};

export default function IncomingCallNotification({ call }: IncomingCallNotificationProps) {
  const router = useRouter();
  const { toast, dismiss } = useToast();

  const handleAccept = async () => {
    const updates: { [key: string]: any } = {};
    updates[`/calls/${call.id}/status`] = 'answered';
    updates[`/users/${call.receiverId}/incomingCall`] = null;

    try {
      await update(ref(db), updates);
      dismiss();
      router.push(`/call/${call.id}`);
    } catch (error) {
      console.error("Error accepting call:", error);
    }
  };

  const handleReject = async () => {
    const updates: { [key: string]: any } = {};
    updates[`/calls/${call.id}/status`] = 'ended';
    updates[`/users/${call.receiverId}/incomingCall`] = null;

    try {
      await update(ref(db), updates);
      dismiss();
    } catch (error) {
      console.error("Error rejecting call:", error);
    }
  };
  
  useEffect(() => {
    const {id} = toast({
      duration: Infinity,
      description: (
        <div className="flex items-center gap-4">
          <Avatar>
            <AvatarImage src={call.caller.photoURL} />
            <AvatarFallback>{call.caller.displayName.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="flex-grow">
            <p className="font-bold">{call.caller.displayName}</p>
            <p className="text-sm text-muted-foreground">Chamada de voz...</p>
          </div>
          <div className="flex gap-2">
            <Button variant="destructive" size="icon" onClick={handleReject}>
              <PhoneOff className="h-5 w-5" />
            </Button>
            <Button variant="default" size="icon" className="bg-green-500 hover:bg-green-600" onClick={handleAccept}>
              <Phone className="h-5 w-5" />
            </Button>
          </div>
        </div>
      ),
    });
    return () => dismiss(id);
  }, [call, toast, dismiss]);

  return null;
}
