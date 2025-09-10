
"use client";

import { useState, useRef, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db, storage } from '@/lib/firebase';
import { ref as dbRef, set } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile } from 'firebase/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { User as UserIcon } from 'lucide-react';

export default function CompleteProfilePage() {
  const [user, loadingAuth] = useAuthState(auth);
  const [username, setUsername] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setLoading(true);

    try {
      let photoURL = user.photoURL || '';

      // Upload photo if a new one is selected
      if (photo) {
        const photoStorageRef = storageRef(storage, `avatars/${user.uid}/${photo.name}`);
        const uploadResult = await uploadBytes(photoStorageRef, photo);
        photoURL = await getDownloadURL(uploadResult.ref);
      }

      // Update Firebase Auth profile
      await updateProfile(user, {
        displayName: username,
        photoURL: photoURL,
      });

      // Save user data to Realtime Database
      const userDbRef = dbRef(db, 'users/' + user.uid);
      await set(userDbRef, {
        uid: user.uid,
        displayName: username,
        email: user.email,
        photoURL: photoURL,
        createdAt: new Date().toISOString(),
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
        description: 'Não foi possível salvar o perfil. Tente novamente.',
      });
    } finally {
      setLoading(false);
    }
  };

  if (loadingAuth) {
    return <div className="flex items-center justify-center min-h-screen">Carregando...</div>;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Complete seu Perfil</CardTitle>
          <CardDescription>Para continuar, adicione um nome de usuário e uma foto de perfil.</CardDescription>
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
                Escolher Foto
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Nome de Usuário (obrigatório)</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ex: @joaosilva"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Salvando...' : 'Confirmar e Salvar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

    