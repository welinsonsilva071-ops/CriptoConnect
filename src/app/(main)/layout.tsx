"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, User, signOut, deleteUser } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { ref, remove, onValue, off } from 'firebase/database';
import LeftSidebar from "@/components/layout/left-sidebar";
import RightSidebar from "@/components/layout/right-sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from '@/components/ui/button';
import { MoreHorizontal } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

type DbUser = {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  createdAt: string;
}

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);

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
    <div className="min-h-screen bg-background">
      <div className="container mx-auto grid grid-cols-1 md:grid-cols-12 gap-8">
        <aside className="hidden md:block md:col-span-3 xl:col-span-2 py-4">
          <LeftSidebar />
        </aside>
        <main className="col-span-1 md:col-span-9 xl:col-span-7 border-x border-border min-h-screen">
          {children}
        </main>
        <aside className="hidden lg:block lg:col-span-3 py-4">
          <div className="sticky top-4 space-y-4">
             <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center justify-between w-full h-auto py-2">
                  <div className="flex items-center gap-2">
                     <Avatar className="h-10 w-10">
                      <AvatarImage src={dbUser.photoURL || undefined} />
                      <AvatarFallback>{(dbUser.displayName || 'U').charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="text-left">
                      <span className="font-bold">{dbUser.displayName}</span>
                    </div>
                  </div>
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  Log Out
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDeleteAccount} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                  Delete Account
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <RightSidebar />
          </div>
        </aside>
      </div>
    </div>
  );
}
