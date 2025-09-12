
"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { ref, onValue, off, push, serverTimestamp, set, update, get } from 'firebase/database';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Send, Phone, Video } from 'lucide-react';
import Link from 'next/link';
import MessageBubble from '@/components/messages/message-bubble';
import startChat from '@/lib/start-chat';
import { useToast } from '@/hooks/use-toast';

type Message = {
  id: string;
  author: string;
  content: string;
  timestamp: number;
};

type ChatMember = {
    uid: string;
    displayName: string;
    photoURL?: string;
}

export default function ChatPage() {
  const [currentUser] = useAuthState(auth);
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const chatId = params.chatId as string;

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [otherUser, setOtherUser] = useState<ChatMember | null>(null);
  const [loading, setLoading] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  useEffect(() => {
    if (!currentUser || !chatId) return;

    const otherUserId = chatId.replace(currentUser.uid, '').replace('_', '');
    
    startChat(currentUser.uid, otherUserId).catch(err => {
      console.error(err);
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar chat',
        description: 'Não foi possível carregar a conversa. Tente novamente.'
      })
      router.push('/');
    });

    const messagesRef = ref(db, `chats/${chatId}/messages`);
    const otherUserRef = ref(db, `users/${otherUserId}`);

    const unsubscribeMessages = onValue(messagesRef, (snapshot) => {
      const messagesData = snapshot.val();
      if (messagesData) {
        const messagesList: Message[] = Object.keys(messagesData).map(key => ({
          id: key,
          ...messagesData[key]
        })).sort((a,b) => a.timestamp - b.timestamp);
        setMessages(messagesList);
      } else {
        setMessages([]);
      }
      setLoading(false);
    });

    const unsubscribeUser = onValue(otherUserRef, (snapshot) => {
       if (snapshot.exists()) {
           const userData = snapshot.val();
           setOtherUser({
               uid: otherUserId,
               displayName: userData.displayName,
               photoURL: userData.photoURL
           });
       }
    });

    return () => {
      off(messagesRef, 'value', unsubscribeMessages);
      off(otherUserRef, 'value', unsubscribeUser);
    };

  }, [currentUser, chatId, router, toast]);
  

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUser) return;

    const messagesRef = ref(db, `chats/${chatId}/messages`);
    
    try {
        await push(messagesRef, {
            author: currentUser.uid,
            content: newMessage.trim(),
            timestamp: serverTimestamp(),
        });
        setNewMessage('');
    } catch(error) {
        console.error("Error sending message:", error);
        toast({
            variant: "destructive",
            title: "Erro",
            description: "Não foi possível enviar a mensagem."
        })
    }
  };

  const handleStartCall = async (type: 'voice' | 'video') => {
    if (!currentUser || !otherUser) return;

    // Verification before starting the call
    const otherUserRef = ref(db, `users/${otherUser.uid}`);
    const otherUserSnap = await get(otherUserRef);
    if (!otherUserSnap.exists() || !otherUserSnap.val().displayName) {
        toast({
            variant: "destructive",
            title: "Não é possível iniciar a chamada",
            description: "O usuário ainda não completou o perfil."
        });
        return;
    }
    
    try {
        const callId = push(ref(db, 'calls')).key;
        if (!callId) throw new Error("Could not create call ID");

        const callData = {
            callId,
            caller: {
              uid: currentUser.uid,
              displayName: currentUser.displayName,
              photoURL: currentUser.photoURL,
            },
            receiver: {
              uid: otherUser.uid,
              displayName: otherUser.displayName,
              photoURL: otherUser.photoURL,
            },
            type,
            status: 'ringing',
            createdAt: serverTimestamp(),
        };

        const updates: { [key: string]: any } = {};
        updates[`/calls/${callId}`] = callData;
        updates[`/users/${otherUser.uid}/incomingCall`] = {
            callId,
            caller: {
                uid: currentUser.uid,
                displayName: currentUser.displayName,
                photoURL: currentUser.photoURL,
            },
            type,
        };

        await update(ref(db), updates);

        if (type === 'voice') {
            router.push(`/call/${callId}`);
        } else {
            router.push(`/video-call/${callId}`);
        }

    } catch (error) {
        console.error("Error starting call:", error);
        toast({
            variant: "destructive",
            title: "Erro ao iniciar chamada",
            description: "Não foi possível iniciar a chamada. Tente novamente."
        })
    }
};

  if (loading) {
    return <div className="flex items-center justify-center h-full">Carregando conversa...</div>;
  }

  return (
    <>
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm p-2 border-b border-border flex items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/">
              <ArrowLeft />
            </Link>
          </Button>
          {otherUser && (
            <>
              <Avatar>
                <AvatarImage src={otherUser.photoURL} alt={otherUser.displayName} />
                <AvatarFallback>{otherUser.displayName.charAt(0)}</AvatarFallback>
              </Avatar>
              <h2 className="text-lg font-bold">{otherUser.displayName}</h2>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => handleStartCall('voice')}>
                <Phone />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleStartCall('video')}>
                <Video />
            </Button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} isCurrentUser={message.author === currentUser?.uid} />
        ))}
         <div ref={messagesEndRef} />
      </main>

      <footer className="p-4 bg-background border-t border-border">
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Digite uma mensagem..."
            autoComplete="off"
          />
          <Button type="submit" size="icon" disabled={!newMessage.trim()}>
            <Send />
          </Button>
        </form>
      </footer>
    </>
  );
}
