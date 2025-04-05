import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { getUsersForNewConversation } from "@/actions/message";
import NewMessageUI from "@/components/messages/NewMessageUI";

export const dynamic = 'force-dynamic';

export default async function NewMessagePage() {
  const session = await getAuthSession();
  
  if (!session?.user) {
    redirect("/login");
  }
  
  // Get all users except the current user
  const users = await getUsersForNewConversation();
  
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 overflow-x-hidden">
      <div className="flex items-center gap-4 mb-6">
        <Button asChild variant="ghost" size="icon">
          <Link href="/messages">
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">New Message</h1>
      </div>
      
      <NewMessageUI initialUsers={users} />
    </div>
  );
} 