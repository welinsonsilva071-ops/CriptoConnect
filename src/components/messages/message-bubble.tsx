
"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

type Message = {
  id: string;
  author: string;
  content: string;
  timestamp: number;
};

type MessageBubbleProps = {
  message: Message;
  isCurrentUser: boolean;
  isSelected: boolean;
  isSelectionMode: boolean;
  onSelect: (messageId: string) => void;
};

export default function MessageBubble({ message, isCurrentUser, isSelected, isSelectionMode, onSelect }: MessageBubbleProps) {
  const pressTimer = useRef<NodeJS.Timeout | null>(null);

  const handleTouchStart = () => {
    pressTimer.current = setTimeout(() => {
      onSelect(message.id);
    }, 500); // 500ms for long press
  };

  const handleTouchEnd = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const handleClick = () => {
    if (isSelectionMode) {
      onSelect(message.id);
    }
  };

  useEffect(() => {
    // Cleanup timer on component unmount
    return () => {
      if (pressTimer.current) {
        clearTimeout(pressTimer.current);
      }
    };
  }, []);

  return (
    <div
      className={cn(
        "flex items-end gap-2 group transition-colors duration-200 rounded-lg",
        isCurrentUser ? "justify-end" : "justify-start",
        isSelected ? "bg-blue-500/20" : "bg-transparent",
      )}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleTouchStart}
      onMouseUp={handleTouchEnd}
      onMouseLeave={handleTouchEnd}
      onClick={handleClick}
    >
      <div
        className={cn(
          "max-w-xs md:max-w-md lg:max-w-lg rounded-lg px-4 py-2 my-1",
           isSelected
            ? (isCurrentUser ? "bg-blue-700 text-white" : "bg-blue-600 text-white")
            : (isCurrentUser
              ? "bg-primary text-primary-foreground rounded-br-none"
              : "bg-muted rounded-bl-none")
        )}
      >
        <p className="text-base break-words">{message.content}</p>
        <p className={cn(
          "text-xs mt-1 text-right", 
          isSelected ? "text-white/70" : (isCurrentUser ? "text-primary-foreground/70" : "text-muted-foreground")
        )}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}
