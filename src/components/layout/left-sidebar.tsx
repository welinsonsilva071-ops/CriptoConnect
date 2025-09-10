
import Link from 'next/link';
import { Home, User, MessageSquare, Settings, Bell, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { users } from '@/lib/data';

export default function LeftSidebar() {
  const currentUser = users[0]; // This is mock, will be replaced by auth user
  const menuItems = [
    { icon: Home, text: 'Conversas', href: '/' },
    { icon: Search, text: 'Buscar', href: '/search-users' },
    { icon: Bell, text: 'Notifications', href: '/notifications' },
    { icon: User, text: 'Profile', href: `/${currentUser.username}` }, // This needs to be dynamic
    { icon: Settings, text: 'Settings', href: '/settings' },
  ];

  return (
    <div className="flex flex-col h-full sticky top-0 py-4">
      <div className="px-4 mb-6">
        <Link href="/" className="flex items-center gap-3">
           <div className="bg-primary rounded-lg p-2 flex items-center justify-center h-10 w-10">
            <span className="font-bold text-lg text-primary-foreground">CC</span>
           </div>
          <h1 className="text-2xl font-bold font-headline hidden xl:block">CriptoConnect</h1>
        </Link>
      </div>
      <nav className="flex-grow">
        <ul>
          {menuItems.map((item) => (
            <li key={item.text} className="mb-2">
              <Link href={item.href}>
                <Button variant="ghost" className="w-full justify-start text-lg h-auto py-3 gap-4">
                  <item.icon className="h-6 w-6" />
                  <span className="hidden xl:inline">{item.text}</span>
                </Button>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
