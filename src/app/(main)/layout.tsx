"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, User, signOut, deleteUser } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { ref, remove } from 'firebase/database';
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
import { getUserFromDatabase } from '@/lib/data';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        if (!currentUser.emailVerified) {
          router.push('/auth/verify-email');
        } else {
          // Check if user has completed profile in DB
          const dbUser = await getUserFromDatabase(currentUser.uid);
          if (dbUser) {
            setUser(currentUser);
            setLoading(false);
          } else {
             // User exists in Auth, but not in DB, needs to complete profile
            router.push('/complete-profile');
          }
        }
      } else {
        router.push('/login');
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/login');
  };

  const handleDeleteAccount = async () => {
    if (user) {
      const confirmation = confirm("Tem certeza que deseja excluir sua conta? Esta ação é irreversível.");
      if (confirmation) {
        try {
          // Delete from Realtime Database
          await remove(ref(db, `users/${user.uid}`));
          // Delete from Firebase Auth
          await deleteUser(user);
          toast({
            title: "Conta Excluída",
            description: "Sua conta foi excluída com sucesso.",
          });
          router.push('/signup');
        } catch (error) {
          console.error("Error deleting account:", error);
          toast({
            variant: "destructive",
            title: "Erro",
            description: "Não foi possível excluir a conta. Pode ser necessário fazer login novamente para confirmar.",
          });
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        Carregando...
      </div>
    )
  }
  
  if (!user) {
    // This case can happen briefly while redirects are in-flight.
    // A loading indicator is appropriate here as well.
     return (
      <div className="flex items-center justify-center min-h-screen">
        Carregando...
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
                      <AvatarImage src={user.photoURL || undefined} />
                      <AvatarFallback>{(user.displayName || user.email || 'U').charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="text-left">
                      <span className="font-bold">{user.displayName || user.email}</span>
                    </div>
                  </div>
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  Sair
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDeleteAccount} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                  Excluir Conta
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
    
