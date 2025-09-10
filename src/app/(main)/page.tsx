
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { ref, onValue, off } from 'firebase/database';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { UserPlus } from 'lucide-react';
import type { User as DbUser } from '@/lib/data';

type Chat = {
  chatId: string;
  lastMessage: string;
  timestamp: number;
  otherMember: DbUser;
};

export default function HomePage() {
  const [user, loading] = useAuthState(auth);
  const router = useRouter();
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(true);

  useEffect(() => {
    if (loading || !user) return;

    const userChatsRef = ref(db, `users/${user.uid}/chats`);
    
    const listener = onValue(userChatsRef, (snapshot) => {
      if (snapshot.exists()) {
        const chatIds = Object.keys(snapshot.val());
        const chatPromises = chatIds.map(chatId => {
          return new Promise<Chat | null>(resolve => {
            const chatRef = ref(db, `chats/${chatId}`);
            onValue(chatRef, async (chatSnap) => {
              if (chatSnap.exists()) {
                const chatData = chatSnap.val();
                const otherMemberId = Object.keys(chatData.members).find(id => id !== user.uid);

                if (otherMemberId) {
                  const userRef = ref(db, `users/${otherMemberId}`);
                  onValue(userRef, (userSnap) => {
                    if (userSnap.exists()) {
                       const messages = chatData.messages ? Object.values(chatData.messages) as any[] : [];
                       const lastMessage = messages.sort((a,b) => b.timestamp - a.timestamp)[0];
                      
                       resolve({
                        chatId,
                        lastMessage: lastMessage?.content || "No messages yet.",
                        timestamp: lastMessage?.timestamp || chatData.createdAt,
                        otherMember: { ...userSnap.val(), id: otherMemberId }
                      });
                    } else {
                       resolve(null);
                    }
                  }, { onlyOnce: true });
                } else {
                  resolve(null);
                }
              } else {
                resolve(null);
              }
            }, { onlyOnce: true });
          });
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
    };

  }, [user, loading]);


  return (
    <div>
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm p-4 border-b border-border flex justify-between items-center">
        <h2 className="text-xl font-bold">Conversas</h2>
        <Button variant="ghost" size="icon" asChild>
          <Link href="/search-users">
            <UserPlus />
            <span className="sr-only">Adicionar Contato</span>
          </Link>
        </Button>
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
    </div>
  );
}
