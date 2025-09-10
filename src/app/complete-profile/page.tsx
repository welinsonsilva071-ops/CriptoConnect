"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, updateProfile, User } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { ref, set } from 'firebase/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User as UserIcon } from 'lucide-react';
import Image from 'next/image';

const avatarOptions = [
  'https://picsum.photos/id/1027/200/200',
  'https://picsum.photos/id/1005/200/200',
  'https://picsum.photos/id/1011/200/200',
  'https://picsum.photos/id/1012/200/200',
  'https://picsum.photos/id/1025/200/200',
  'https://picsum.photos/id/1040/200/200',
];

export default function CompleteProfilePage() {
  const [username, setUsername] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        router.push('/login');
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleCompleteProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!photoURL) {
       toast({
        variant: 'destructive',
        title: 'Selecione um Avatar',
        description: 'Por favor, escolha uma foto de perfil da galeria.',
      });
      return;
    }
    setLoading(true);

    try {
      // 1. Update Firebase Auth profile
      await updateProfile(user, {
        displayName: username,
        photoURL: photoURL,
      });

      // 2. Create a user entry in Realtime Database
      await set(ref(db, 'users/' + user.uid), {
        uid: user.uid,
        displayName: username,
        email: user.email,
        photoURL: photoURL,
        createdAt: new Date().toISOString(),
      });

      toast({
        title: 'Perfil Completo!',
        description: 'Seu perfil foi atualizado com sucesso.',
      });
      router.push('/');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível atualizar o perfil.',
      });
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return <div className="flex items-center justify-center min-h-screen">Carregando...</div>;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center">
          <Avatar className="w-24 h-24 mb-4">
            <AvatarImage src={photoURL} />
            <AvatarFallback>
              <UserIcon className="w-12 h-12" />
            </AvatarFallback>
          </Avatar>
          <CardTitle>Complete seu Perfil</CardTitle>
          <CardDescription>Adicione uma foto e nome de usuário.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCompleteProfile} className="space-y-6">
            <div>
              <Label className="mb-4 block text-center">Escolha seu avatar</Label>
              <div className="grid grid-cols-3 gap-4">
                {avatarOptions.map((url) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setPhotoURL(url)}
                    className={`rounded-full overflow-hidden transition-all duration-200 ${photoURL === url ? 'ring-4 ring-primary' : 'ring-0 ring-transparent hover:ring-2 hover:ring-primary/50'}`}
                  >
                    <Image src={url} alt="Avatar option" width={100} height={100} className="w-full h-auto"/>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Nome de Usuário</Label>
              <Input
                id="username"
                type="text"
                placeholder="seunome"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar e Continuar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
