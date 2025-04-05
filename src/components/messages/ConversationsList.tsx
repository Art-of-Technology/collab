'use client';

import { useConversations } from "@/hooks/queries/useMessage";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

interface ConversationWithDetails {
  id: string;
  participants: {
    id: string;
    name: string | null;
    image: string | null;
    role: string | null;
  }[];
  messages: {
    id: string;
    content: string;
    createdAt: string | Date;
    senderId: string;
    sender: {
      id: string;
      name: string | null;
    };
  }[];
  unreadCount: number;
}

interface ConversationsListProps {
  initialConversations: ConversationWithDetails[];
  currentUserId: string;
}

export default function ConversationsList({ 
  initialConversations,
  currentUserId 
}: ConversationsListProps) {
  // Use the hook with the initialData provided by the server
  const { data: conversations, isLoading } = useConversations();
  
  // Use the data from the query if available, otherwise use the initial data
  const conversationsData = conversations || initialConversations;
  
  if (isLoading && !initialConversations.length) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  if (!conversationsData.length) {
    return (
      <div className="text-center py-12 px-6 rounded-lg border border-border/40 bg-card/30 shadow-sm">
        <p className="text-muted-foreground mb-4">You don&apos;t have any conversations yet</p>
        <Button asChild variant="default" size="lg" className="shadow-md hover:shadow-lg transition-all">
          <Link href="/messages/new">Start a new conversation</Link>
        </Button>
      </div>
    );
  }
  
  return (
    <Card className="border-border/40 bg-card/95 shadow-lg">
      <CardHeader className="p-4 border-b border-border/40">
        <h2 className="text-lg font-semibold">Recent Conversations</h2>
      </CardHeader>
      <CardContent className="p-0 divide-y divide-border/30">
        {conversationsData.map((conversation) => {
          const otherParticipant = conversation.participants[0];
          const lastMessage = conversation.messages[0];
          
          return (
            <Link 
              key={conversation.id} 
              href={`/messages/${conversation.id}`}
              className="block p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Avatar className="border-2 border-primary/10">
                  <AvatarImage src={otherParticipant?.image || undefined} alt={otherParticipant?.name || "User"} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {otherParticipant?.name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-medium truncate">{otherParticipant?.name}</p>
                    {lastMessage && (
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(lastMessage.createdAt), { addSuffix: true })}
                      </p>
                    )}
                  </div>
                  {lastMessage ? (
                    <div className="flex justify-between items-center">
                      <p className="text-sm text-muted-foreground truncate">
                        {lastMessage.senderId === currentUserId ? 'You: ' : ''}
                        {lastMessage.content}
                      </p>
                      {conversation.unreadCount > 0 && (
                        <span className="flex-shrink-0 bg-primary text-primary-foreground rounded-full w-5 h-5 text-xs flex items-center justify-center ml-2 shadow-sm">
                          {conversation.unreadCount}
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No messages yet</p>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
} 