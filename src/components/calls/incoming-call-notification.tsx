
"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue, off, update, remove, get } from 'firebase/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Phone, PhoneOff } from 'lucide-react';
import { useRouter } from 'next/navigation';

type Call = {
    id: string;
    callerId: string;
    receiverId: string;
    callerInfo: {
        displayName: string;
        photoURL: string;
    },
    status: 'dialing' | 'answered' | 'rejected' | 'ended';
};

export default function IncomingCallNotification({ userId }: { userId: string }) {
    const [incomingCall, setIncomingCall] = useState<Call | null>(null);
    const router = useRouter();

    useEffect(() => {
        if (!userId) return;

        const incomingCallRef = ref(db, `users/${userId}/incomingCall`);

        const unsubscribe = onValue(incomingCallRef, async (snapshot) => {
            const incomingCallData = snapshot.val();
            if (incomingCallData?.callId) {
                const callRef = ref(db, `calls/${incomingCallData.callId}`);
                const callSnap = await get(callRef);
                if (callSnap.exists()) {
                    const callData = callSnap.val();
                    if (callData.status === 'dialing') {
                        setIncomingCall({ id: callSnap.key, ...callData });
                    } else {
                        // Clean up if the call is no longer active
                        remove(incomingCallRef);
                        setIncomingCall(null);
                    }
                }
            } else {
                setIncomingCall(null);
            }
        });

        return () => off(incomingCallRef, 'value', unsubscribe);
    }, [userId]);

    const cleanup = () => {
        if (!userId) return;
        const incomingCallRef = ref(db, `users/${userId}/incomingCall`);
        remove(incomingCallRef);
        setIncomingCall(null);
    }

    const handleAnswer = () => {
        if (!incomingCall) return;
        const callRef = ref(db, `calls/${incomingCall.id}`);
        update(callRef, { status: 'answered' });
        cleanup();
        router.push(`/call/${incomingCall.id}`);
    };

    const handleReject = () => {
        if (!incomingCall) return;
        const callRef = ref(db, `calls/${incomingCall.id}`);
        update(callRef, { status: 'rejected' });
        cleanup();
    };
    
    if (!incomingCall) {
        return null;
    }

    return (
        <div className="absolute inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <Card className="w-full max-w-sm animate-in fade-in-0 zoom-in-95">
                <CardHeader className="text-center">
                    <CardTitle>Chamada de Voz Recebida</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-4">
                    <Avatar className="h-24 w-24 border-4 border-primary">
                        <AvatarImage src={incomingCall.callerInfo.photoURL} alt={incomingCall.callerInfo.displayName} />
                        <AvatarFallback>{incomingCall.callerInfo.displayName.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="text-center">
                        <p className="text-xl font-bold">{incomingCall.callerInfo.displayName}</p>
                        <p className="text-sm text-muted-foreground">CriptoConnect Call</p>
                    </div>
                    <div className="flex w-full justify-around mt-4">
                        <Button
                            variant="destructive"
                            size="lg"
                            className="rounded-full h-16 w-16 p-0"
                            onClick={handleReject}
                        >
                            <PhoneOff className="h-8 w-8" />
                        </Button>
                        <Button
                            variant="default"
                            size="lg"
                            className="rounded-full h-16 w-16 p-0 bg-green-500 hover:bg-green-600"
                            onClick={handleAnswer}
                        >
                            <Phone className="h-8 w-8" />
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
