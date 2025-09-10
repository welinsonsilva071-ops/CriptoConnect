import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { MailCheck } from 'lucide-react';
import Link from 'next/link';

export default function VerifyEmailPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto bg-primary text-primary-foreground rounded-full h-16 w-16 flex items-center justify-center mb-4">
            <MailCheck className="h-8 w-8" />
          </div>
          <CardTitle>Verifique seu E-mail</CardTitle>
          <CardDescription>
            Enviamos um link de verificação para o seu endereço de e-mail. Por favor, clique no link para ativar sua conta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Depois de verificar, você pode{' '}
            <Link href="/login" className="underline font-semibold">
              fazer login
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
