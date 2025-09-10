
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { ref, onValue, off, get } from 'firebase/database';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { UserPlus, Users, Plus, MoreHorizontal } from 'lucide-react';
import type { User as DbUser } from '@/lib/data';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from '@/hooks/use-toast';
import { signOut, deleteUser } from 'firebase/auth';

type Chat = {
  chatId: string;
  lastMessage: string;
  timestamp: number;
  otherMember: DbUser;
};

type CurrentDbUser = {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  createdAt: string;
}

export default function HomePage() {
  const [user, loading] = useAuthState(auth);
  const router = useRouter();
  const { toast } = useToast();
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [dbUser, setDbUser] = useState<CurrentDbUser | null>(null);


  useEffect(() => {
    if (loading || !user) return;

    const dbUserRef = ref(db, `users/${user.uid}`);
    const unsubscribeDbUser = onValue(dbUserRef, (snapshot) => {
        if(snapshot.exists()) {
            setDbUser(snapshot.val());
        }
    });

    const userChatsRef = ref(db, `users/${user.uid}/chats`);
    
    const listener = onValue(userChatsRef, (snapshot) => {
      setIsLoadingChats(true);
      if (snapshot.exists()) {
        const chatIds = Object.keys(snapshot.val());
        const chatPromises = chatIds.map(async chatId => {
          const chatRef = ref(db, `chats/${chatId}`);
          const chatSnap = await get(chatRef);

          if (chatSnap.exists()) {
            const chatData = chatSnap.val();
            const otherMemberId = Object.keys(chatData.members).find(id => id !== user.uid);

            if (otherMemberId) {
              const userRef = ref(db, `users/${otherMemberId}`);
              const userSnap = await get(userRef);

              if (userSnap.exists()) {
                  const messages = chatData.messages ? Object.values(chatData.messages) as any[] : [];
                  const lastMessage = messages.sort((a,b) => b.timestamp - a.timestamp)[0];
                  
                  return {
                    chatId,
                    lastMessage: lastMessage?.content || "No messages yet.",
                    timestamp: lastMessage?.timestamp || chatData.createdAt,
                    otherMember: { ...userSnap.val(), id: otherMemberId }
                  };
              }
            }
          }
          return null;
        });

        Promise.all(chatPromises).then(resolvedChats => {
          const validChats = resolvedChats.filter(c => c !== null) as Chat[];
          validChats.sort((a,b) => b.timestamp - a.timestamp);
          setChats(validChats);
          setIsLoadingChats(false);
        });

      } else {
        setChats([]);
        setIsLoadingChats(false);
      }
    });

    return () => {
      off(userChatsRef, 'value', listener);
      off(dbUserRef, 'value', unsubscribeDbUser);
    };

  }, [user, loading, router]);

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/login');
  };

  const handleDeleteAccount = async () => {
    if (user) {
      const confirmation = confirm("Are you sure you want to delete your account? This action is irreversible.");
      if (confirmation) {
        try {
          await ref(db, `users/${user.uid}`).remove();
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


  return (
    <div className="relative min-h-screen">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm p-4 border-b border-border flex justify-between items-center">
        <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={dbUser?.photoURL || undefined} />
              <AvatarFallback>{(dbUser?.displayName || 'U').charAt(0)}</AvatarFallback>
            </Avatar>
            <h2 className="text-xl font-bold">Conversas</h2>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end">
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
      </header>

      <section>
        {isLoadingChats && <p className="p-4 text-center text-muted-foreground">Carregando conversas...</p>}
        {!isLoadingChats && chats.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-muted-foreground mb-4">Nenhuma conversa encontrada.</p>
            <Button asChild>
              <Link href="/search-users">Encontrar contatos</Link>
            </Button>
          </div>
        )}
        {!isLoadingChats && chats.map(chat => (
          <Link href={`/messages/${chat.chatId}`} key={chat.chatId} className="flex items-center gap-3 p-4 hover:bg-muted/50 cursor-pointer border-b border-border">
            <Avatar>
              <AvatarImage src={chat.otherMember.photoURL} alt={chat.otherMember.displayName} />
              <AvatarFallback>{chat.otherMember.displayName.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="flex-grow overflow-hidden">
              <div className="flex justify-between">
                <span className="font-semibold">{chat.otherMember.displayName}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(chat.timestamp).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' })}
                </span>
              </div>
              <p className="text-sm text-muted-foreground truncate">{chat.lastMessage}</p>
            </div>
          </Link>
        ))}
      </section>

      <div className="absolute bottom-6 right-6">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="rounded-full h-14 w-14 shadow-lg">
              <Plus className="h-6 w-6" />
              <span className="sr-only">Abrir Menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" side="top" align="end">
            <DropdownMenuItem asChild>
               <Link href="/search-users" className="cursor-pointer">
                <UserPlus className="mr-2 h-4 w-4" />
                <span>Adicionar Contato</span>
               </Link>
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <Users className="mr-2 h-4 w-4" />
              <span>Criar Grupo (em breve)</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
