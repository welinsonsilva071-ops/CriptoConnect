
import type { User } from '@/lib/data';
import Image from 'next/image';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { CalendarDays, Link as LinkIcon, MapPin } from 'lucide-react';
import ProfilePhotoDialog from './profile-photo-dialog';


export default function ProfileHeader({ user }: { user: User }) {
  return (
    <div>
      <div className="h-48 bg-muted relative">
        <Image 
          src="https://picsum.photos/seed/header/1500/500" 
          alt="Profile banner" 
          fill
          className="object-cover"
          data-ai-hint="abstract landscape"
        />
      </div>
      <div className="p-4">
        <div className="flex justify-between items-start">
          <div className="-mt-20">
            <ProfilePhotoDialog name={user.name} photoURL={user.avatar}>
              <Avatar className="h-32 w-32 border-4 border-background bg-background cursor-pointer">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
              </Avatar>
            </ProfilePhotoDialog>
          </div>
          <Button className="rounded-full font-semibold">Follow</Button>
        </div>
        <div className="mt-2">
          <h2 className="text-2xl font-bold">{user.name}</h2>
          <p className="text-muted-foreground">@{user.username}</p>
        </div>
        <p className="mt-4">{user.bio}</p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-muted-foreground text-sm">
          <div className="flex items-center gap-1">
            <MapPin className="h-4 w-4" />
            <span>Earth</span>
          </div>
          <div className="flex items-center gap-1">
            <LinkIcon className="h-4 w-4" />
            <a href="#" className="text-primary hover:underline">portfolio.com</a>
          </div>
          <div className="flex items-center gap-1">
            <CalendarDays className="h-4 w-4" />
            <span>Joined June 2024</span>
          </div>
        </div>
        <div className="mt-4 flex gap-4 text-sm">
          <div>
            <span className="font-bold">123</span>
            <span className="text-muted-foreground"> Following</span>
          </div>
          <div>
            <span className="font-bold">456</span>
            <span className="text-muted-foreground"> Followers</span>
          </div>
        </div>
      </div>
    </div>
  );
}
