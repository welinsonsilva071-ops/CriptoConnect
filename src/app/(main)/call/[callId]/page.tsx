
"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { ref, onValue, off, update, get } from 'firebase/database';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { PhoneOff, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

type Call = {
    callerId: string;
    receiverId: string;
    callerInfo: {
        displayName: string;
        photoURL: string;
    };
    status: 'dialing' | 'answered' | 'rejected' | 'ended';
};

type UserInfo = {
    displayName: string;
    photoURL: string;
}

export default function CallPage() {
    const [currentUser] = useAuthState(auth);
    const router = useRouter();
    const params = useParams();
    const callId = params.callId as string;

    const [callData, setCallData] = useState<Call | null>(null);
    const [otherUserInfo, setOtherUserInfo] = useState<UserInfo | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isSpeaker, setIsSpeaker] = useState(true);
    const [callDuration, setCallDuration] = useState(0);

    useEffect(() => {
        if (!callId || !currentUser) return;

        const callRef = ref(db, `calls/${callId}`);
        const unsubscribe = onValue(callRef, async (snapshot) => {
            const data = snapshot.val() as Call;
            if (!data || data.status === 'rejected' || data.status === 'ended') {
                router.push('/');
                return;
            }
            setCallData(data);

            const otherUserId = data.callerId === currentUser.uid ? data.receiverId : data.callerId;
            const otherUserRef = ref(db, `users/${otherUserId}`);
            const otherUserSnap = await get(otherUserRef);
            if (otherUserSnap.exists()) {
                setOtherUserInfo(otherUserSnap.val());
            }
        });

        return () => off(callRef, 'value', unsubscribe);
    }, [callId, currentUser, router]);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (callData?.status === 'answered') {
            interval = setInterval(() => {
                setCallDuration(prev => prev + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [callData?.status]);

    const handleEndCall = () => {
        const callRef = ref(db, `calls/${callId}`);
        update(callRef, { status: 'ended' });
        router.push('/');
    };

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    };

    if (!callData || !otherUserInfo) {
        return <div className="flex items-center justify-center min-h-screen">Carregando chamada...</div>;
    }

    const isCaller = callData.callerId === currentUser?.uid;

    return (
        <div className="h-full w-full bg-slate-800 text-white flex flex-col items-center justify-between p-8">
            <div className="text-center mt-12">
                <Avatar className="h-32 w-32 mx-auto border-4 border-white/50">
                    <AvatarImage src={otherUserInfo.photoURL} />
                    <AvatarFallback className="text-5xl bg-slate-600">
                        {otherUserInfo.displayName.charAt(0)}
                    </AvatarFallback>
                </Avatar>
                <h1 className="text-3xl font-bold mt-4">{otherUserInfo.displayName}</h1>
                <p className="text-lg text-white/70 mt-1">
                    {callData.status === 'dialing' && (isCaller ? 'Discando...' : 'Recebendo chamada...')}
                    {callData.status === 'answered' && formatDuration(callDuration)}
                </p>
            </div>

            <div className="flex flex-col items-center gap-8">
                 <div className="flex items-center gap-8">
                     <Button variant="ghost" className="h-16 w-16 rounded-full bg-white/10 hover:bg-white/20" onClick={() => setIsSpeaker(!isSpeaker)}>
                        {isSpeaker ? <Volume2 size={32} /> : <VolumeX size={32} />}
                     </Button>
                     <Button variant="ghost" className="h-16 w-16 rounded-full bg-white/10 hover:bg-white/20" onClick={() => setIsMuted(!isMuted)}>
                        {isMuted ? <MicOff size={32} /> : <Mic size={32} />}
                     </Button>
                 </div>
                <Button
                    variant="destructive"
                    size="lg"
                    className="rounded-full h-20 w-20 p-0"
                    onClick={handleEndCall}
                >
                    <PhoneOff className="h-10 w-10" />
                </Button>
            </div>
        </div>
    );
}
