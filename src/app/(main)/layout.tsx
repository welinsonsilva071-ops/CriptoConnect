
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { ref, onValue, off, get } from 'firebase/database';
import { MessageCircle, Users, Library, History } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import IncomingCallNotification from '@/components/calls/incoming-call-notification';
import type { Call } from '@/components/calls/incoming-call-notification';

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

  const isMessagesPage = pathname.includes('/messages/');
  const isCallPage = pathname.includes('/call/');

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
                } else {
                   setIncomingCall(null);
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
        {incomingCall && <IncomingCallNotification call={incomingCall} />}
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
