import { getCurrentUser } from "@/lib/session";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import StartConversationForm from "@/components/messages/StartConversationForm";

interface NewMessagePageProps {
  params: {
    userId: string;
  };
}

export default async function NewMessageWithUserPage({ params }: NewMessagePageProps) {
  const { userId } = params;
  const currentUser = await getCurrentUser();
  
  if (!currentUser) {
    redirect("/login");
  }
  
  // Make sure the user isn't trying to message themselves
  if (userId === currentUser.id) {
    redirect("/messages");
  }
  
  // Get the user to start a conversation with
  const recipient = await prisma.user.findUnique({
    where: {
      id: userId
    },
    select: {
      id: true,
      name: true,
      image: true,
      role: true,
      team: true
    }
  });
  
  if (!recipient) {
    notFound();
  }
  
  // Check if a conversation already exists
  const existingConversation = await prisma.conversation.findFirst({
    where: {
      AND: [
        {
          participants: {
            some: {
              id: currentUser.id
            }
          }
        },
        {
          participants: {
            some: {
              id: userId
            }
          }
        }
      ]
    }
  });
  
  // If a conversation already exists, redirect to it
  if (existingConversation) {
    redirect(`/messages/${existingConversation.id}`);
  }
  
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 overflow-x-hidden">
      <StartConversationForm recipient={recipient} />
    </div>
  );
} 