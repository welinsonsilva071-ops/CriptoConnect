
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { ref, onValue, off, get, update } from 'firebase/database';
import { MessageCircle, Users, Library, History, Phone, PhoneOff } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';


type Call = {
  id: string;
  callerId: string;
  receiverId: string;
  status: 'ringing' | 'answered' | 'ended';
  caller: {
    displayName: string;
    photoURL?: string;
  }
};


type DbUser = {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  createdAt: string;
}

const navItems = [
  { href: '/', label: 'Conversas', icon: MessageCircle },
  { href: '#', label: 'Status', icon: Users },
  { href: '#', label: 'Biblioteca', icon: Library },
  { href: '#', label: 'Histórico', icon: History },
];

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const { toast, dismiss } = useToast();

  const isMessagesPage = pathname.includes('/messages/');
  const isCallPage = pathname.includes('/call/');

    useEffect(() => {
    if (!incomingCall) return;

    const handleAccept = async () => {
      const updates: { [key: string]: any } = {};
      updates[`/calls/${incomingCall.id}/status`] = 'answered';
      updates[`/users/${incomingCall.receiverId}/incomingCall`] = null;

      try {
        await update(ref(db), updates);
        dismiss();
        router.push(`/call/${incomingCall.id}`);
      } catch (error) {
        console.error("Error accepting call:", error);
      }
    };

    const handleReject = async () => {
      const updates: { [key: string]: any } = {};
      updates[`/calls/${incomingCall.id}/status`] = 'ended';
      updates[`/users/${incomingCall.receiverId}/incomingCall`] = null;

      try {
        await update(ref(db), updates);
        dismiss();
      } catch (error) {
        console.error("Error rejecting call:", error);
      }
    };

    const { id } = toast({
      duration: Infinity,
      description: (
        <div className="flex items-center gap-4">
          <Avatar>
            <AvatarImage src={incomingCall.caller.photoURL} />
            <AvatarFallback>{incomingCall.caller.displayName.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="flex-grow">
            <p className="font-bold">{incomingCall.caller.displayName}</p>
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
  }, [incomingCall, router, dismiss, toast]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        if (!currentUser.emailVerified) {
          router.push('/auth/verify-email');
          setLoading(false);
          return;
        }
        
        const userDbRef = ref(db, `users/${currentUser.uid}`);
        const unsubscribeDb = onValue(userDbRef, async (snapshot) => {
          if (snapshot.exists()) {
            const userData = snapshot.val();
            setDbUser({ ...userData, uid: currentUser.uid });
            
            if (userData.incomingCall) {
              const callSnap = await get(ref(db, `calls/${userData.incomingCall}`));
              if (callSnap.exists()) {
                const callData = callSnap.val();
                if (callData.status === 'ringing') {
                   const callerSnap = await get(ref(db, `users/${callData.callerId}`));
                   if(callerSnap.exists()){
                     setIncomingCall({ id: userData.incomingCall, ...callData, caller: callerSnap.val() });
                   }
                }
              }
            } else {
              setIncomingCall(null);
            }

            setLoading(false);
          } else {
            router.push('/complete-profile');
            setLoading(false);
          }
        });

        return () => {
          off(userDbRef, 'value', unsubscribeDb);
        }

      } else {
        setUser(null);
        setDbUser(null);
        setIncomingCall(null);
        router.push('/login');
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, [router]);
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        Loading...
      </div>
    )
  }
  
  if (!user || !dbUser) {
     return (
      <div className="flex items-center justify-center min-h-screen">
        Loading...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex justify-center">
      <div className="w-full max-w-sm flex flex-col relative">
        <main className={`flex-1 border-x border-border min-h-0 overflow-y-auto ${isMessagesPage || isCallPage ? 'grid grid-rows-[auto,1fr,auto]' : ''}`}>
          {children}
        </main>
        {!isMessagesPage && !isCallPage && (
           <footer className="sticky bottom-0 bg-background border-t border-border">
            <nav className="flex justify-around items-center h-16">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link href={item.href} key={item.label} className={cn(
                    "flex flex-col items-center justify-center gap-1 text-xs w-full h-full",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}>
                      <item.icon className="h-6 w-6" />
                      <span>{item.label}</span>
                  </Link>
                )
              })}
            </nav>
          </footer>
        )}
      </div>
    </div>
  );
}
