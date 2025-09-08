import type { Post } from '@/lib/data';
import Link from 'next/link';
import Image from 'next/image';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Heart, MessageCircle, Repeat, MoreHorizontal, Share2 } from 'lucide-react';

function LinkPreview({ link }: { link: NonNullable<Post['link']> }) {
  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer" className="mt-2 block border border-border rounded-lg overflow-hidden hover:bg-muted/50 transition-colors">
      <div className="flex">
        {link.image && <Image src={link.image} alt={link.title} width={150} height={150} className="object-cover" data-ai-hint="abstract background"/>}
        <div className="p-4 flex-1">
          <p className="font-semibold text-sm line-clamp-1">{link.title}</p>
          <p className="text-sm text-muted-foreground line-clamp-2">{link.description}</p>
        </div>
      </div>
    </a>
  );
}

export default function PostCard({ post }: { post: Post }) {
  return (
    <article className="border-b border-border p-4 flex gap-4 hover:bg-muted/30 transition-colors">
      <Link href={`/${post.author.username}`}>
        <Avatar>
          <AvatarImage src={post.author.avatar} alt={post.author.name} />
          <AvatarFallback>{post.author.name.charAt(0)}</AvatarFallback>
        </Avatar>
      </Link>
      <div className="w-full">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <Link href={`/${post.author.username}`} className="font-bold hover:underline">{post.author.name}</Link>
            <span className="text-muted-foreground">@{post.author.username}</span>
            <span className="text-muted-foreground">·</span>
            <Link href="#" className="text-muted-foreground hover:underline">{post.createdAt}</Link>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 -mt-1">
            <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
          </Button>
        </div>

        <p className="whitespace-pre-wrap my-1">{post.content}</p>

        {post.image && (
          <div className="mt-2 rounded-lg overflow-hidden border border-border relative aspect-[16/9]">
            <Image src={post.image} alt="Post image" fill className="w-full h-auto object-cover" data-ai-hint="workspace setup"/>
          </div>
        )}
        
        {post.link && <LinkPreview link={post.link} />}

        <div className="flex justify-between items-center mt-4 text-muted-foreground max-w-sm">
          <Button variant="ghost" size="sm" className="flex items-center gap-2 hover:text-primary">
            <MessageCircle className="h-5 w-5" />
            <span>{post.comments}</span>
          </Button>
          <Button variant="ghost" size="sm" className="flex items-center gap-2 hover:text-green-500">
            <Repeat className="h-5 w-5" />
            <span>{post.reposts}</span>
          </Button>
          <Button variant="ghost" size="sm" className="flex items-center gap-2 hover:text-red-500">
            <Heart className="h-5 w-5" />
            <span>{post.likes}</span>
          </Button>
          <Button variant="ghost" size="icon" className="hover:text-primary">
            <Share2 className="h-5 w-5"/>
          </Button>
        </div>
      </div>
    </article>
  );
}
