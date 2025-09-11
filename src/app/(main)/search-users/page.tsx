
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
import { useRouter } from 'next/navigation';
import { Loader2, UserPlus, Search } from 'lucide-react';
import startChat from '@/lib/start-chat';

type DbUser = {
  id: string;
  uid: string;
  displayName: string;
  photoURL?: string;
  phone: string;
};

export default function SearchUsersPage() {
  const [currentUser] = useAuthState(auth);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResult, setSearchResult] = useState<DbUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const phoneToSearch = `+55${searchTerm.replace(/\D/g, '')}`;
    if (phoneToSearch.length < 13) {
        toast({
            variant: "destructive",
            title: "Número Inválido",
            description: "Por favor, digite um número de telefone válido.",
        });
        return;
    };

    setLoading(true);
    setNotFound(false);
    setSearchResult(null);

    try {
      const usersRef = ref(db, 'users');
      const phoneQuery = query(usersRef, orderByChild('phone'), equalTo(phoneToSearch));
      const snapshot = await get(phoneQuery);

      if (snapshot.exists()) {
        const data = snapshot.val();
        const userId = Object.keys(data)[0];
        
        if (userId === currentUser?.uid) {
            toast({
              variant: 'default',
              title: 'Ops!',
              description: 'Você não pode iniciar uma conversa com você mesmo.'
            });
            setNotFound(false);
            setSearchResult(null);
        } else {
            setSearchResult({ ...data[userId], id: userId, uid: userId });
            setNotFound(false);
        }
        
      } else {
        setNotFound(true);
        setSearchResult(null);
      }
    } catch (error) {
      console.error("Error searching user:", error);
      toast({
        variant: "destructive",
        title: "Erro na Busca",
        description: "Ocorreu um erro ao buscar o usuário. Verifique as regras do seu banco de dados.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveContactAndStartChat = async (otherUserId: string) => {
    if (!currentUser) return;
    setIsSaving(true);
    try {
      await startChat(currentUser.uid, otherUserId, "Oi, peguei seu contato. Vamos conversar?");

      toast({
        title: 'Contato Adicionado!',
        description: 'Você já pode começar a conversar.',
      });

      router.push('/');

    } catch (error) {
      console.error("Error starting chat:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível adicionar o contato e iniciar a conversa.",
      });
    } finally {
        setIsSaving(false);
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
          <div className="flex items-center gap-2 w-full">
            <span className="h-10 px-3 py-2 text-base md:text-sm rounded-md border border-input bg-background text-muted-foreground flex items-center">+55</span>
            <Input
              placeholder="(XX) XXXXX-XXXX"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value.replace(/\D/g, ''))}
              type="tel"
              className="w-full"
              maxLength={11}
            />
          </div>
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
                <Button onClick={() => handleSaveContactAndStartChat(searchResult.id)} disabled={isSaving}>
                  {isSaving ? <Loader2 className="animate-spin" /> : <UserPlus />}
                   <span className="ml-2 hidden sm:inline">Adicionar aos Contatos</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
