import { getCurrentUser } from "@/lib/session";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import MessageInput from "@/components/messages/MessageInput";
import MessageList from "@/components/messages/MessageList";

export default async function ConversationPage({
  params,
}: {
  params: { conversationId: string };
}) {
  const _params = await params;
  const { conversationId } = _params;
  const currentUser = await getCurrentUser();
  
  if (!currentUser) {
    redirect("/login");
  }
  
  // Verify the user is part of the conversation
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      participants: {
        some: {
          id: currentUser.id
        }
      }
    },
    include: {
      participants: true,
      messages: {
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              image: true
            }
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      }
    }
  });
  
  if (!conversation) {
    notFound();
  }
  
  // Find the other participant
  const otherParticipant = conversation.participants.find(
    participant => participant.id !== currentUser.id
  );
  
  if (!otherParticipant) {
    notFound();
  }
  
  // Mark unread messages as read
  await prisma.message.updateMany({
    where: {
      conversationId,
      receiverId: currentUser.id,
      read: false
    },
    data: {
      read: true
    }
  });
  
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-4xl mx-auto border border-border/40 rounded-lg shadow-lg overflow-hidden">
      {/* Fixed header */}
      <div className="bg-card/95 border-b border-border/40 p-4 flex items-center gap-4 z-10 rounded-t-lg sticky top-0">
        <Button asChild variant="ghost" size="icon" className="hover:bg-background/50">
          <Link href="/messages">
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <Avatar className="border-2 border-primary/10">
            <AvatarImage src={otherParticipant.image || undefined} alt={otherParticipant.name || "User"} />
            <AvatarFallback className="bg-primary/10 text-primary">
              {otherParticipant.name?.charAt(0).toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{otherParticipant.name}</p>
            <p className="text-xs text-muted-foreground">{otherParticipant.role || "Developer"}</p>
          </div>
        </div>
      </div>
      
      {/* Scrollable message area */}
      <div className="flex-1 overflow-y-auto p-4 bg-background/30">
        <MessageList 
          messages={conversation.messages} 
          currentUserId={currentUser.id}
        />
      </div>
      
      {/* Fixed message input at bottom */}
      <div className="sticky bottom-0 z-10">
        <MessageInput conversationId={conversationId} />
      </div>
    </div>
  );
} 