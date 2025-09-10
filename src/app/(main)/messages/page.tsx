
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare } from 'lucide-react';

export default function MessagesPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-4">
       <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <div className="mx-auto bg-primary text-primary-foreground rounded-full h-16 w-16 flex items-center justify-center mb-4">
            <MessageSquare className="h-8 w-8" />
          </div>
          <CardTitle>Selecione uma conversa</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Escolha uma pessoa da sua lista de contatos à esquerda para começar a conversar.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
