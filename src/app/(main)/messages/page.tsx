import { users } from '@/lib/data';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Send } from 'lucide-react';

export default function MessagesPage() {
  const conversations = users;
  const selectedUser = users[1];

  return (
    <div className="grid grid-cols-12 h-screen">
      <aside className="col-span-12 md:col-span-4 border-r border-border flex flex-col">
        <header className="p-4 border-b border-border">
          <h2 className="text-xl font-bold">Messages</h2>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search messages" className="pl-8" />
          </div>
        </header>
        <div className="flex-grow overflow-y-auto">
          {conversations.map(user => (
            <div key={user.id} className="flex items-center gap-3 p-4 hover:bg-muted/50 cursor-pointer border-b border-border">
              <Avatar>
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-grow overflow-hidden">
                <div className="flex justify-between">
                  <span className="font-semibold">{user.name}</span>
                  <span className="text-xs text-muted-foreground">2h</span>
                </div>
                <p className="text-sm text-muted-foreground truncate">Hey! Just checking in about the...</p>
              </div>
            </div>
          ))}
        </div>
      </aside>
      <main className="hidden md:flex col-span-8 flex-col">
        <header className="flex items-center gap-3 p-4 border-b border-border">
          <Avatar>
            <AvatarImage src={selectedUser.avatar} alt={selectedUser.name} />
            <AvatarFallback>{selectedUser.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold">{selectedUser.name}</p>
            <p className="text-sm text-muted-foreground">@{selectedUser.username}</p>
          </div>
        </header>
        <div className="flex-grow p-4 overflow-y-auto space-y-4 bg-muted/30">
          <div className="flex justify-end">
            <p className="bg-primary text-primary-foreground p-3 rounded-lg max-w-xs">Hey Bob, how's it going?</p>
          </div>
          <div className="flex justify-start">
            <p className="bg-background shadow-sm p-3 rounded-lg max-w-xs">Hey Alice! Going great. Just reviewing that article on L2s. Pretty insightful stuff.</p>
          </div>
        </div>
        <footer className="p-4 border-t border-border bg-background">
          <div className="relative">
            <Input placeholder="Start a new message" className="pr-12" />
            <Button size="icon" className="absolute right-1 top-1 h-8 w-8">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </footer>
      </main>
    </div>
  );
}
