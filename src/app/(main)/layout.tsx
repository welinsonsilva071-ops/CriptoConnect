
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, User, signOut, deleteUser } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { ref, remove, onValue, off } from 'firebase/database';
import { MessageCircle, Users, Library, History, Home } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import IncomingCallNotification from '@/components/calls/incoming-call-notification';

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
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);

  const isMessagesPage = pathname.includes('/messages/');

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
        const unsubscribeDb = onValue(userDbRef, (snapshot) => {
          if (snapshot.exists()) {
            setDbUser({ ...snapshot.val(), uid: currentUser.uid });
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
        router.push('/login');
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, [router]);

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/login');
  };

  const handleDeleteAccount = async () => {
    if (user) {
      const confirmation = confirm("Are you sure you want to delete your account? This action is irreversible.");
      if (confirmation) {
        try {
          await remove(ref(db, `users/${user.uid}`));
          await deleteUser(user);
          toast({
            title: "Account Deleted",
            description: "Your account has been successfully deleted.",
          });
          router.push('/signup');
        } catch (error) {
          console.error("Error deleting account:", error);
          toast({
            variant: "destructive",
            title: "Error",
            description: "Could not delete account. You may need to log in again to confirm.",
          });
        }
      }
    }
  };

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
        {user && <IncomingCallNotification userId={user.uid} />}
        <main className={`flex-1 border-x border-border min-h-0 overflow-y-auto ${isMessagesPage ? 'grid grid-rows-[auto,1fr,auto]' : ''}`}>
          {children}
        </main>
        {!isMessagesPage && (
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
