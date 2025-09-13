
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ChevronRight, User, Shield } from 'lucide-react';

export default function SettingsPage() {
  const settingsOptions = [
    {
      href: '/settings/profile',
      icon: User,
      title: 'Editar Perfil',
      description: 'Atualize sua foto, nome e informações de contato.',
    },
    {
      href: '#',
      icon: Shield,
      title: 'Conta e Privacidade',
      description: 'Gerencie a segurança e a privacidade da sua conta.',
    },
  ];

  return (
    <div>
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm p-4 border-b border-border">
        <h2 className="text-xl font-bold">Configurações</h2>
      </header>
      <div className="p-4">
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {settingsOptions.map((option) => (
                <li key={option.title}>
                  <Link href={option.href}>
                    <div className="flex items-center p-4 hover:bg-muted/50 cursor-pointer">
                      <option.icon className="h-6 w-6 mr-4 text-primary" />
                      <div className="flex-1">
                        <p className="font-semibold">{option.title}</p>
                        <p className="text-sm text-muted-foreground">{option.description}</p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
