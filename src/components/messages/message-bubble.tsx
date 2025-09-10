
"use client";

import { cn } from "@/lib/utils";

type Message = {
  id: string;
  author: string;
  content: string;
  timestamp: number;
};

type MessageBubbleProps = {
  message: Message;
  isCurrentUser: boolean;
};

export default function MessageBubble({ message, isCurrentUser }: MessageBubbleProps) {
  return (
    <div
      className={cn(
        "flex items-end gap-2",
        isCurrentUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-xs md:max-w-md lg:max-w-lg rounded-lg px-4 py-2",
          isCurrentUser
            ? "bg-primary text-primary-foreground rounded-br-none"
            : "bg-muted rounded-bl-none"
        )}
      >
        <p className="text-base">{message.content}</p>
        <p className={cn("text-xs mt-1", isCurrentUser ? "text-primary-foreground/70" : "text-muted-foreground")}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}
