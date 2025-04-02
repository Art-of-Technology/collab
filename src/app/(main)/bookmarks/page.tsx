import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import PostList from "@/components/posts/PostList";
import { Card, CardContent } from "@/components/ui/card";
import { cookies } from "next/headers";

export const dynamic = 'force-dynamic';

export default async function BookmarksPage() {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }
  
  // Get current workspace from cookie
  const cookieStore = await cookies();
  const currentWorkspaceId = cookieStore.get('currentWorkspaceId')?.value;

  // If no workspace ID found, we need to get the user's workspaces
  let workspaceId = currentWorkspaceId;
  
  if (!workspaceId) {
    // Get user's first workspace
    const workspace = await prisma.workspace.findFirst({
      where: {
        OR: [
          { ownerId: user.id },
          { members: { some: { userId: user.id } } }
        ]
      },
      orderBy: {
        createdAt: 'asc'
      },
      select: { id: true }
    });
    
    if (workspace) {
      workspaceId = workspace.id;
    }
  }

  // If we still don't have a workspaceId, redirect to create workspace
  if (!workspaceId) {
    redirect('/create-workspace');
  }
  
  // Find all posts that the user has bookmarked
  const bookmarkedPosts = await prisma.post.findMany({
    where: {
      workspaceId: workspaceId,
      reactions: {
        some: {
          authorId: user.id,
          type: "BOOKMARK",
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      author: true,
      tags: true,
      comments: {
        include: {
          author: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      reactions: true,
    },
  });
  
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 overflow-x-hidden">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Bookmarks</h1>
        <p className="text-muted-foreground">
          Posts you&apos;ve saved for later
        </p>
      </div>
      
      {bookmarkedPosts.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <p>You haven&apos;t bookmarked any posts yet.</p>
            <p className="text-sm mt-1">
              When you bookmark posts, they&apos;ll appear here for easy access.
            </p>
          </CardContent>
        </Card>
      ) : (
        <PostList 
          posts={bookmarkedPosts}
          currentUserId={user.id} 
        />
      )}
    </div>
  );
} 