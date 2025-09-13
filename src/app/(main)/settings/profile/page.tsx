
"use client";

import { useState, useRef, ChangeEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User as FirebaseUser, onAuthStateChanged, updateProfile } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { ref as dbRef, onValue, update } from 'firebase/database';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { User as UserIcon, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';

type DbUser = {
  displayName: string;
  email: string;
  phone: string;
  photoURL?: string;
};

// Função para converter arquivo para Data URI
const fileToDataUri = (file: File): Promise<string> => 
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
});

export default function EditProfilePage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const userDbRef = dbRef(db, `users/${currentUser.uid}`);
        onValue(userDbRef, (snapshot) => {
          if (snapshot.exists()) {
            const userData = snapshot.val();
            setDbUser(userData);
            setDisplayName(userData.displayName);
            setPhone(userData.phone.replace('+55', ''));
            setPhotoPreview(userData.photoURL);
            setLoading(false);
          } else {
             router.push('/complete-profile');
          }
        });
      } else {
        router.push('/login');
      }
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
    if (!user || !dbUser) return;
    
    if (!displayName.trim()) {
      toast({ variant: 'destructive', title: 'Erro', description: 'O nome de usuário é obrigatório.' });
      return;
    }
    const fullPhoneNumber = `+55${phone.replace(/\D/g, '')}`;
    if (fullPhoneNumber.length < 13) {
       toast({ variant: 'destructive', title: 'Erro', description: 'O número de telefone está incompleto.' });
       return;
    }
    setSaving(true);

    try {
      let newPhotoURL = dbUser.photoURL || '';

      if (photo) {
        newPhotoURL = await fileToDataUri(photo);
      }

      // Dados para atualizar no Realtime Database
      const updates: Partial<DbUser> = {};
      if (displayName !== dbUser.displayName) updates.displayName = displayName;
      if (fullPhoneNumber !== dbUser.phone) updates.phone = fullPhoneNumber;
      if (newPhotoURL !== dbUser.photoURL) updates.photoURL = newPhotoURL;
      
      // Atualiza o perfil no Firebase Auth (APENAS displayName)
      await updateProfile(user, {
        displayName: displayName,
      });
      
      // Atualiza os dados no Realtime Database
      if (Object.keys(updates).length > 0) {
        await update(dbRef(db, 'users/' + user.uid), updates);
      }

      toast({
        title: 'Perfil Atualizado!',
        description: 'Suas informações foram salvas com sucesso.',
      });

      router.push('/');

    } catch (error) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Erro ao Salvar',
        description: 'Não foi possível salvar as alterações. Tente novamente.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Carregando perfil...</div>;
  }

  if (!dbUser) {
    return <div className="flex items-center justify-center min-h-screen">Usuário não encontrado.</div>;
  }

  return (
    <div>
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm p-2 border-b border-border flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
                <Link href="/settings">
                    <ArrowLeft />
                </Link>
            </Button>
            <h2 className="text-xl font-bold">Editar Perfil</h2>
        </header>
        <div className="p-4">
            <Card className="w-full max-w-md mx-auto">
                <CardHeader>
                    <CardTitle>Suas Informações</CardTitle>
                    <CardDescription>Mantenha seus dados sempre atualizados.</CardDescription>
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
                        Trocar Foto
                    </Button>
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="displayName">Nome de Usuário</Label>
                    <Input
                        id="displayName"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        required
                    />
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="phone">Número de Telefone</Label>
                    <div className="flex items-center gap-2">
                        <span className="h-10 px-3 py-2 text-base md:text-sm rounded-md border border-input bg-background text-muted-foreground flex items-center">+55</span>
                        <Input
                        id="phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                        required
                        maxLength={11}
                        />
                    </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            value={dbUser.email}
                            disabled
                            className="bg-muted/50"
                        />
                        <p className="text-xs text-muted-foreground">O e-mail não pode ser alterado.</p>
                    </div>

                    <Button type="submit" className="w-full" disabled={saving}>
                        {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</> : 'Salvar Alterações'}
                    </Button>
                </form>
                </CardContent>
            </Card>
        </div>
    </div>
  );
}
