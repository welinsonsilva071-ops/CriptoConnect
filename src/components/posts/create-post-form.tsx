"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Image as ImageIcon, Link2 } from 'lucide-react';
import { users } from "@/lib/data";

export default function CreatePostForm() {
  const currentUser = users[0];

  return (
    <div className="flex gap-4">
      <Avatar>
        <AvatarImage src={currentUser.avatar} alt={currentUser.name} />
        <AvatarFallback>{currentUser.name.charAt(0)}</AvatarFallback>
      </Avatar>
      <div className="w-full">
        <Textarea
          placeholder="What's happening?"
          className="border-none focus-visible:ring-0 text-lg p-0 resize-none"
          rows={1}
        />
        <div className="flex justify-between items-center mt-4">
          <div className="flex gap-1 text-primary">
            <Button variant="ghost" size="icon">
              <ImageIcon className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon">
              <Link2 className="h-5 w-5" />
            </Button>
          </div>
          <Button className="rounded-full font-semibold">Post</Button>
        </div>
      </div>
    </div>
  );
}
