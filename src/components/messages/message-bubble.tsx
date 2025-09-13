
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

const LONG_PRESS_DURATION = 3000; // 3 segundos
const MOVE_THRESHOLD = 10; // Tolerância de 10px para movimento

export default function MessageBubble({ message, isCurrentUser, isSelected, isSelectionMode, onSelect }: MessageBubbleProps) {
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const touchStartPos = useRef<{ x: number, y: number } | null>(null);

  const startPressTimer = () => {
    pressTimer.current = setTimeout(() => {
      onSelect(message.id);
      pressTimer.current = null;
    }, LONG_PRESS_DURATION);
  };
  
  const clearPressTimer = () => {
     if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    touchStartPos.current = null;
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isSelectionMode) return;
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    startPressTimer();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!pressTimer.current || !touchStartPos.current) return;

    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartPos.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartPos.current.y);

    if (deltaX > MOVE_THRESHOLD || deltaY > MOVE_THRESHOLD) {
      clearPressTimer();
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isSelectionMode) return;
    if (e.button === 0) { // Apenas para o botão esquerdo do mouse
      startPressTimer();
    }
  }

  const handleClick = () => {
    if (pressTimer.current) {
        clearPressTimer();
    }
    if (isSelectionMode) {
      onSelect(message.id);
    }
  };

  useEffect(() => {
    return () => {
      clearPressTimer();
    };
  }, []);

  return (
    <div
      className={cn(
        "flex items-end gap-2 group transition-colors duration-200 rounded-lg -my-1", // Negative margin to bring bubbles closer
        isCurrentUser ? "justify-end" : "justify-start",
        isSelected ? "bg-blue-500/20" : "bg-transparent",
      )}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={clearPressTimer}
      onMouseDown={handleMouseDown}
      onMouseUp={clearPressTimer}
      onMouseLeave={clearPressTimer}
      onClick={handleClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className={cn(
          "max-w-xs md:max-w-md lg:max-w-lg rounded-lg px-3 py-2 my-1 flex items-end gap-2",
           isSelected
            ? (isCurrentUser ? "bg-blue-700 text-white" : "bg-blue-600 text-white")
            : (isCurrentUser
              ? "bg-primary text-primary-foreground rounded-br-none"
              : "bg-muted rounded-bl-none")
        )}
      >
        <p className="text-base break-words whitespace-pre-wrap">{message.content}</p>
        <span className={cn(
          "text-xs whitespace-nowrap self-end", 
          isSelected ? "text-white/70" : (isCurrentUser ? "text-primary-foreground/70" : "text-muted-foreground")
        )}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}
