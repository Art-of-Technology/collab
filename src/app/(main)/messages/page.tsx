import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Conversation } from "@prisma/client";

export const dynamic = 'force-dynamic';

// Define types for the conversations data structure
interface ConversationWithDetails extends Conversation {
  participants: {
    id: string;
    name: string | null;
    image: string | null;
    role: string | null;
  }[];
  messages: {
    id: string;
    content: string;
    createdAt: Date;
    senderId: string;
    sender: {
      id: string;
      name: string | null;
    };
  }[];
  unreadCount: number;
}

export default async function MessagesPage() {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }
  
  // Get user with conversations
  const userWithConversations = await prisma.user.findUnique({
    where: {
      id: user.id
    },
    include: {
      conversations: {
        include: {
          participants: {
            where: {
              id: {
                not: user.id
              }
            },
            select: {
              id: true,
              name: true,
              image: true,
              role: true
            }
          },
          messages: {
            orderBy: {
              createdAt: 'desc'
            },
            take: 1,
            include: {
              sender: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        },
        orderBy: {
          updatedAt: 'desc'
        }
      }
    }
  });
  
  const conversations = userWithConversations?.conversations || [];
  
  // Count unread messages for each conversation
  const conversationsWithCounts = await Promise.all(
    conversations.map(async (conversation) => {
      const unreadCount = await prisma.message.count({
        where: {
          conversationId: conversation.id,
          receiverId: user.id,
          read: false
        }
      });
      
      return {
        ...conversation,
        unreadCount
      } as ConversationWithDetails;
    })
  );
  
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 overflow-x-hidden">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Messages</h1>
        <Button asChild variant="outline" className="gap-2 border-border/60 hover:bg-background/90 hover:text-primary">
          <Link href="/messages/new">
            <PlusIcon className="h-4 w-4" />
            <span>New Message</span>
          </Link>
        </Button>
      </div>
      
      {conversationsWithCounts.length === 0 ? (
        <div className="text-center py-12 px-6 rounded-lg border border-border/40 bg-card/30 shadow-sm">
          <p className="text-muted-foreground mb-4">You don&apos;t have any conversations yet</p>
          <Button asChild variant="default" size="lg" className="shadow-md hover:shadow-lg transition-all">
            <Link href="/messages/new">Start a new conversation</Link>
          </Button>
        </div>
      ) : (
        <Card className="border-border/40 bg-card/95 shadow-lg">
          <CardHeader className="p-4 border-b border-border/40">
            <h2 className="text-lg font-semibold">Recent Conversations</h2>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-border/30">
            {conversationsWithCounts.map((conversation) => {
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
                            {lastMessage.senderId === user.id ? 'You: ' : ''}
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
      )}
    </div>
  );
} 