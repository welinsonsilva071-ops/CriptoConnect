
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { ref, onValue, off, get } from 'firebase/database';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { UserPlus, MoreHorizontal, LogOut, Trash2, Settings } from 'lucide-react';
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
import ProfilePhotoDialog from '@/components/profile/profile-photo-dialog';

type DbUser = {
  id: string;
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
};

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
                    otherMember: { ...userSnap.val(), id: otherMemberId, uid: otherMemberId }
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
      const confirmation = confirm("Tem certeza de que deseja excluir sua conta? Esta ação é irreversível.");
      if (confirmation) {
        try {
          await ref(db, `users/${user.uid}`).remove();
          await deleteUser(user);
          toast({
            title: "Conta Deletada",
            description: "Sua conta foi excluída com sucesso.",
          });
          router.push('/signup');
        } catch (error) {
          console.error("Error deleting account:", error);
          toast({
            variant: "destructive",
            title: "Erro",
            description: "Não foi possível excluir a conta. Você pode precisar fazer login novamente para confirmar.",
          });
        }
      }
    }
  };


  return (
    <div className="relative min-h-full flex flex-col bg-slate-50 dark:bg-slate-900">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm p-4 border-b border-border flex justify-between items-center">
        <div className="flex items-center gap-4">
          <ProfilePhotoDialog
              name={dbUser?.displayName || ''}
              photoURL={dbUser?.photoURL || undefined}
          >
              <Avatar className="h-10 w-10 border-2 border-primary/50 cursor-pointer">
                <AvatarImage src={dbUser?.photoURL || undefined} />
                <AvatarFallback>{(dbUser?.displayName || 'U').charAt(0)}</AvatarFallback>
              </Avatar>
          </ProfilePhotoDialog>
          <h2 className="text-xl font-bold">Conversas</h2>
        </div>
        <div className="flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end">
              <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Configurações</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sair</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDeleteAccount} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                <span>Excluir Conta</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <section className="flex-grow">
        {isLoadingChats && <p className="p-4 text-center text-muted-foreground">Carregando conversas...</p>}
        {!isLoadingChats && chats.length === 0 && (
          <div className="p-8 text-center flex flex-col items-center justify-center h-full">
            <p className="text-muted-foreground mb-4">Nenhuma conversa encontrada.</p>
             <Button asChild>
                <Link href="/search-users">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Adicionar Contato
                </Link>
              </Button>
          </div>
        )}
        {!isLoadingChats && (
          <div className="divide-y divide-border">
            {chats.map(chat => (
              <div key={chat.chatId} className="flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors duration-200">
                 <ProfilePhotoDialog
                    name={chat.otherMember.displayName}
                    photoURL={chat.otherMember.photoURL}
                  >
                    <Avatar className="cursor-pointer">
                      <AvatarImage src={chat.otherMember.photoURL} alt={chat.otherMember.displayName} />
                      <AvatarFallback>{chat.otherMember.displayName.charAt(0)}</AvatarFallback>
                    </Avatar>
                  </ProfilePhotoDialog>
                <Link href={`/messages/${chat.chatId}`} className="flex-grow overflow-hidden">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold truncate">{chat.otherMember.displayName}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(chat.timestamp).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{chat.lastMessage}</p>
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="absolute bottom-20 right-4">
        <Button asChild className="rounded-full shadow-lg h-14 w-14">
            <Link href="/search-users">
                <UserPlus className="h-6 w-6" />
            </Link>
        </Button>
      </div>

    </div>
  );
}
