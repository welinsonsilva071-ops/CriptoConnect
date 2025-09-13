
"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { ref, onValue, off, push, serverTimestamp, update, get, remove } from 'firebase/database';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Send, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import MessageBubble from '@/components/messages/message-bubble';
import startChat from '@/lib/start-chat';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';

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

type DeletedMessages = {
  [messageId: string]: boolean;
}

export default function ChatPage() {
  const [currentUser] = useAuthState(auth);
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const chatId = params.chatId as string;

  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [visibleMessages, setVisibleMessages] = useState<Message[]>([]);
  const [deletedForMeIds, setDeletedForMeIds] = useState<DeletedMessages>({});
  const [newMessage, setNewMessage] = useState('');
  const [otherUser, setOtherUser] = useState<ChatMember | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedMessages, setSelectedMessages] = useState<string[]>([]);
  const isSelectionMode = selectedMessages.length > 0;
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const isInitialLoad = useRef(true);


  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [visibleMessages]);

  // Effect to filter messages whenever allMessages or deletedForMeIds changes
  useEffect(() => {
    const filtered = allMessages.filter(msg => !deletedForMeIds[msg.id]);
    setVisibleMessages(filtered);
  }, [allMessages, deletedForMeIds]);

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
    const deletedMessagesRef = ref(db, `users/${currentUser.uid}/deletedMessages/${chatId}`);

    const unsubscribeMessages = onValue(messagesRef, (snapshot) => {
      const messagesData = snapshot.val();
      const messagesList: Message[] = messagesData 
        ? Object.keys(messagesData).map(key => ({
            id: key,
            ...messagesData[key]
          })).sort((a,b) => a.timestamp - b.timestamp)
        : [];

      if (!isInitialLoad.current && messagesList.length > allMessages.length) {
        const lastMessage = messagesList[messagesList.length - 1];
        if (lastMessage.author !== currentUser.uid) {
           audioRef.current?.play().catch(e => console.error("Error playing sound:", e));
        }
      }
      
      setAllMessages(messagesList);
      
      if(isInitialLoad.current) {
        isInitialLoad.current = false;
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

    const unsubscribeDeleted = onValue(deletedMessagesRef, (snapshot) => {
      setDeletedForMeIds(snapshot.val() || {});
    });

    return () => {
      off(messagesRef, 'value', unsubscribeMessages);
      off(otherUserRef, 'value', unsubscribeUser);
      off(deletedMessagesRef, 'value', unsubscribeDeleted);
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

  const handleMessageSelect = (messageId: string) => {
    setSelectedMessages(prev => 
      prev.includes(messageId) 
        ? prev.filter(id => id !== messageId) 
        : [...prev, messageId]
    );
  };

  const handleSelectAll = () => {
    if (selectedMessages.length === visibleMessages.length) {
      setSelectedMessages([]);
    } else {
      setSelectedMessages(visibleMessages.map(m => m.id));
    }
  };

  const handleDeleteMessages = async () => {
    if (!currentUser || selectedMessages.length === 0) return;

    const messagesToDelete = allMessages.filter(m => selectedMessages.includes(m.id));
    const deleteForEveryoneUpdates: { [key: string]: null } = {};
    const deleteForMeUpdates: { [key: string]: true } = {};
    
    const originalDeletedForMe = { ...deletedForMeIds };

    messagesToDelete.forEach(msg => {
      if (msg.author === currentUser.uid) {
        // Delete for everyone
        deleteForEveryoneUpdates[`/chats/${chatId}/messages/${msg.id}`] = null;
      } else {
        // Delete for me
        deleteForMeUpdates[`/users/${currentUser.uid}/deletedMessages/${chatId}/${msg.id}`] = true;
      }
    });

    try {
      const updates = { ...deleteForEveryoneUpdates, ...deleteForMeUpdates };
      await update(ref(db), updates);
        
      toast({
          title: `${selectedMessages.length} mensagem(ns) excluída(s).`,
          action: (
            <Button variant="secondary" onClick={() => handleUndoDelete(messagesToDelete, originalDeletedForMe)}>
                Desfazer
            </Button>
          ),
          duration: 3000,
      });

      setSelectedMessages([]);
    } catch (error) {
      console.error("Error deleting messages:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível excluir as mensagens."
      });
    }
  };
  
  const handleUndoDelete = async (messagesToRestore: Message[], originalDeletedState: DeletedMessages) => {
    if (!currentUser) return;
    const restoreUpdates: { [key: string]: any } = {};
    const undoDeleteForMeUpdates: { [key: string]: any } = {};

    messagesToRestore.forEach(msg => {
      if (msg.author === currentUser.uid) {
        // Restore message deleted for everyone
        restoreUpdates[`/chats/${chatId}/messages/${msg.id}`] = {
            author: msg.author,
            content: msg.content,
            timestamp: msg.timestamp
        };
      } else {
        // Undo "delete for me"
        undoDeleteForMeUpdates[`/users/${currentUser.uid}/deletedMessages/${chatId}/${msg.id}`] = null;
      }
    });

    try {
        await update(ref(db), { ...restoreUpdates, ...undoDeleteForMeUpdates });
        toast({ title: "Exclusão cancelada." });
    } catch (error) {
        console.error("Error undoing delete:", error);
        toast({
            variant: "destructive",
            title: "Erro",
            description: "Não foi possível restaurar as mensagens."
        });
    }
  };


  if (loading) {
    return <div className="flex items-center justify-center h-full">Carregando conversa...</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <header className="flex-shrink-0 z-10 bg-background/80 backdrop-blur-sm p-2 border-b border-border flex items-center gap-4 justify-between">
        {isSelectionMode ? (
           <>
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => setSelectedMessages([])}>
                  <X />
                </Button>
                <h2 className="text-lg font-bold">{selectedMessages.length} selecionada(s)</h2>
            </div>
            <div className="flex items-center gap-2">
                <Checkbox
                  aria-label="Selecionar todas as mensagens"
                  checked={selectedMessages.length === visibleMessages.length && visibleMessages.length > 0}
                  onCheckedChange={handleSelectAll}
                />
                 <Button variant="ghost" size="icon" onClick={handleDeleteMessages} disabled={selectedMessages.length === 0}>
                    <Trash2 />
                </Button>
            </div>
           </>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" asChild>
                <Link href="/">
                  <ArrowLeft />
                </Link>
              </Button>
              {otherUser && (
                <>
                  <Avatar>
                    <AvatarImage src={otherUser.photoURL || undefined} alt={otherUser.displayName} />
                    <AvatarFallback>{otherUser.displayName.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <h2 className="text-lg font-bold">{otherUser.displayName}</h2>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
            </div>
          </>
        )}
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-1">
        {visibleMessages.map((message) => (
          <MessageBubble 
            key={message.id} 
            message={message} 
            isCurrentUser={message.author === currentUser?.uid}
            isSelected={selectedMessages.includes(message.id)}
            onSelect={handleMessageSelect}
            isSelectionMode={isSelectionMode}
          />
        ))}
         <div ref={messagesEndRef} />
      </main>

      <footer className="flex-shrink-0 p-4 bg-background border-t border-border">
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
      <audio ref={audioRef} src="/sounds/notification.mp3" preload="auto"></audio>
    </div>
  );
}
