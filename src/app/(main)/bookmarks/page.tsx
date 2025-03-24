import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import PostList from "@/components/posts/PostList";
import { Card, CardContent } from "@/components/ui/card";

export default async function BookmarksPage() {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }
  
  // Find all posts that the user has bookmarked
  const bookmarkedPosts = await prisma.post.findMany({
    where: {
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
          Posts you've saved for later
        </p>
      </div>
      
      {bookmarkedPosts.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <p>You haven't bookmarked any posts yet.</p>
            <p className="text-sm mt-1">
              When you bookmark posts, they'll appear here for easy access.
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