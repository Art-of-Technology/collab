'use client';

import { useEffect, useRef } from "react";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useConversation } from "@/hooks/queries/useMessage";

interface Message {
  id: string;
  content: string;
  createdAt: string | Date;
  senderId: string;
  read: boolean;
  sender: {
    id: string;
    name: string | null;
    image: string | null;
  };
}

interface ConversationMessagesProps {
  conversationId: string;
  initialMessages: Message[];
  currentUserId: string;
}

export default function ConversationMessages({ 
  conversationId,
  initialMessages,
  currentUserId 
}: ConversationMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Use the query hook with initialData
  const { data: conversation } = useConversation(conversationId);
  
  // Use the messages from the query if available, otherwise fall back to initial messages
  const messages = conversation?.messages || initialMessages;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <p className="text-muted-foreground mb-2">No messages yet</p>
        <p className="text-sm text-muted-foreground">
          Send a message to start the conversation
        </p>
      </div>
    );
  }

  // Group messages by date for date separators
  const groupedMessages: { [key: string]: Message[] } = {};
  messages.forEach((message) => {
    const date = new Date(message.createdAt);
    const dateString = format(date, "yyyy-MM-dd");
    if (!groupedMessages[dateString]) {
      groupedMessages[dateString] = [];
    }
    groupedMessages[dateString].push(message);
  });

  return (
    <div className="space-y-6">
      {Object.entries(groupedMessages).map(([date, dateMessages]) => (
        <div key={date} className="space-y-4">
          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="bg-background px-3 py-0.5 text-xs text-muted-foreground rounded-full border border-border/50">
                {format(new Date(date), "MMMM d, yyyy")}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {dateMessages.map((message) => {
              const isCurrentUser = message.senderId === currentUserId;
              return (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-2 max-w-[80%]",
                    isCurrentUser
                      ? "ml-auto flex-row-reverse"
                      : "mr-auto"
                  )}
                >
                  {!isCurrentUser && (
                    <Avatar className="h-8 w-8 border-2 border-primary/10">
                      <AvatarImage src={message.sender.image || undefined} alt={message.sender.name || ""} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {message.sender.name?.[0]?.toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div>
                    <div
                      className={cn(
                        "rounded-lg p-3 shadow-sm",
                        isCurrentUser
                          ? "bg-primary text-primary-foreground"
                          : "bg-card border border-border/50"
                      )}
                    >
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 px-1">
                      {format(new Date(message.createdAt), "h:mm a")}
                      {isCurrentUser && message.read && (
                        <span className="ml-1">· Read</span>
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
} 