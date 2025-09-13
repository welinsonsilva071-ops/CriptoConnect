
"use client";

import { useState, useRef, ChangeEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User, onAuthStateChanged, updateProfile } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { ref as dbRef, set } from 'firebase/database';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { User as UserIcon, Loader2 } from 'lucide-react';

// Função para converter arquivo para Data URI
const fileToDataUri = (file: File): Promise<string> => 
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
});

export default function CompleteProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        if (currentUser?.phoneNumber) {
          setPhone(currentUser.phoneNumber.replace('+55', '').replace(/\D/g, ''));
        }
        if(currentUser?.photoURL) {
            setPhotoPreview(currentUser.photoURL);
        }
      } else {
        router.push('/login');
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, [router]);

  const handlePhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!username.trim()) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'O nome de usuário é obrigatório.',
      });
      return;
    }
    const fullPhoneNumber = `+55${phone.replace(/\D/g, '')}`;
    if (fullPhoneNumber.length < 13) {
       toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'O número de telefone está incompleto.',
      });
      return;
    }
    setLoading(true);

    try {
      let photoDataUri = user.photoURL || '';

      if (photo) {
        // Converte a foto para Data URI antes de salvar
        photoDataUri = await fileToDataUri(photo);
      }
      
      const userDbRef = dbRef(db, 'users/' + user.uid);
      await set(userDbRef, {
        uid: user.uid,
        displayName: username,
        email: user.email,
        phone: fullPhoneNumber,
        photoURL: photoDataUri,
        createdAt: new Date().toISOString(),
      });

      // Atualiza apenas o displayName no Firebase Auth
      await updateProfile(user, {
        displayName: username,
      });

      toast({
        title: 'Perfil Concluído!',
        description: 'Sua conta foi configurada.',
      });

      router.push('/');
    } catch (error) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível salvar o perfil. Verifique as regras do banco de dados e tente novamente.',
      });
    } finally {
      setLoading(false);
    }
  };

  if (loadingAuth || !user) {
    return <div className="flex items-center justify-center min-h-screen">Carregando...</div>;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Complete seu Perfil</CardTitle>
          <CardDescription>Para continuar, adicione seus dados.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveProfile} className="space-y-6">
            <div className="flex flex-col items-center space-y-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handlePhotoChange}
                accept="image/*"
                className="hidden"
              />
              <Avatar
                className="h-24 w-24 cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <AvatarImage src={photoPreview || undefined} alt="Avatar" />
                <AvatarFallback>
                  <UserIcon className="h-12 w-12" />
                </AvatarFallback>
              </Avatar>
              <Button
                type="button"
                variant="link"
                onClick={() => fileInputRef.current?.click()}
              >
                Escolher Foto (opcional)
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Nome de Usuário (obrigatório)</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ex: João Silva"
                required
              />
            </div>
             <div className="space-y-2">
              <Label htmlFor="phone">Número de Telefone (obrigatório)</Label>
               <div className="flex items-center gap-2">
                <span className="h-10 px-3 py-2 text-base md:text-sm rounded-md border border-input bg-background text-muted-foreground flex items-center">+55</span>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  placeholder="(XX) XXXXX-XXXX"
                  required
                  maxLength={11}
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</> : 'Confirmar e Salvar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
