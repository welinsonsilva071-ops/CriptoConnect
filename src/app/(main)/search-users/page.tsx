
"use client";

import { useState } from 'react';
import { db, auth } from '@/lib/firebase';
import { ref, query, orderByChild, equalTo, get } from 'firebase/database';
import { useAuthState } from 'react-firebase-hooks/auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import startChat from '@/lib/start-chat';
import { useRouter } from 'next/navigation';
import { Loader2, UserPlus, Search } from 'lucide-react';
import type { User as DbUser } from '@/lib/data';

type UserWithPhone = DbUser & { phone: string };

export default function SearchUsersPage() {
  const [currentUser] = useAuthState(auth);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResult, setSearchResult] = useState<UserWithPhone | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [adding, setAdding] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setLoading(true);
    setNotFound(false);
    setSearchResult(null);

    try {
      const usersRef = ref(db, 'users');
      const phoneQuery = query(usersRef, orderByChild('phone'), equalTo(searchTerm));
      let snapshot = await get(phoneQuery);

      if (snapshot.exists()) {
        const data = snapshot.val();
        const userId = Object.keys(data)[0];
        
        if (userId === currentUser?.uid) {
            setNotFound(true);
            setSearchResult(null);
            setLoading(false);
            return;
        }
        
        setSearchResult({ ...data[userId], id: userId });
      } else {
        setNotFound(true);
        setSearchResult(null);
      }
    } catch (error) {
      console.error("Error searching user:", error);
      toast({
        variant: "destructive",
        title: "Erro na Busca",
        description: "Ocorreu um erro ao buscar o usuário.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStartChat = async (userId: string) => {
    if (!currentUser) return;
    setAdding(true);
    try {
      const chatId = await startChat(currentUser.uid, userId);
      toast({
        title: "Contato adicionado!",
        description: "Você já pode iniciar uma conversa.",
      });
      router.push(`/messages/${chatId}`);
    } catch (error: any) {
      console.error("Error starting chat:", error);
       toast({
        variant: "destructive",
        title: "Erro",
        description: error.message || "Não foi possível iniciar a conversa.",
      });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div>
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm p-4 border-b border-border">
        <h2 className="text-xl font-bold">Adicionar Novo Contato</h2>
      </header>
      <div className="p-4">
        <CardDescription className="text-center mb-4">
          Digite o número de telefone do contato para verificar se ele já possui uma conta no aplicativo.
        </CardDescription>
        <form onSubmit={handleSearch} className="flex gap-2 mb-6">
          <Input
            placeholder="Buscar por número de telefone"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            type="tel"
          />
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Search />}
            <span className="ml-2 hidden sm:inline">Buscar</span>
          </Button>
        </form>

        {notFound && (
          <p className="text-center text-muted-foreground">Nenhum usuário encontrado com este número.</p>
        )}

        {searchResult && (
          <Card>
            <CardHeader>
              <CardTitle>Usuário Encontrado</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={searchResult.photoURL} alt={searchResult.displayName} />
                    <AvatarFallback>{searchResult.displayName.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold">{searchResult.displayName}</p>
                    <p className="text-sm text-muted-foreground">{searchResult.phone}</p>
                  </div>
                </div>
                <Button onClick={() => handleStartChat(searchResult.id)} disabled={adding}>
                  {adding ? <Loader2 className="animate-spin" /> : <UserPlus />}
                   <span className="ml-2 hidden sm:inline">Adicionar e Conversar</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
