import { redirect } from "next/navigation";
import Link from "next/link";
import { PlusIcon } from "@heroicons/react/24/outline";
import { getAuthSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { getUserConversations } from "@/actions/message";
import ConversationsList from "@/components/messages/ConversationsList";

export const dynamic = 'force-dynamic';

export default async function MessagesPage() {
  const session = await getAuthSession();
  
  if (!session?.user) {
    redirect("/login");
  }
  
  // Get conversations data to pass as initial data
  const conversations = await getUserConversations();
  
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
      
      <ConversationsList 
        initialConversations={conversations} 
        currentUserId={session.user.id} 
      />
    </div>
  );
} 