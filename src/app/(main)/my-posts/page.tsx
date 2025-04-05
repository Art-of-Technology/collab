import { getAuthSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserPosts } from "@/actions/post";
import { verifyWorkspaceAccess } from "@/lib/workspace-helpers";
import UserPostsList from "@/components/posts/UserPostsList";

export const dynamic = 'force-dynamic';

export default async function MyPostsPage() {
  const session = await getAuthSession();
  
  if (!session?.user) {
    redirect("/login");
  }
  
  // Verify workspace access and redirect if needed
  const workspaceId = await verifyWorkspaceAccess({ id: session.user.id });
  
  // Get user posts for initial data
  const initialPosts = await getUserPosts(session.user.id, workspaceId);
  
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 overflow-x-hidden">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">My Posts</h1>
        <p className="text-muted-foreground">
          View and manage your posts
        </p>
      </div>
      
      <UserPostsList 
        userId={session.user.id} 
        workspaceId={workspaceId} 
        initialPosts={initialPosts} 
      />
    </div>
  );
} 