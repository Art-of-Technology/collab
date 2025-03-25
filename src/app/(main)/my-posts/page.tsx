import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import PostList from "@/components/posts/PostList";
import { Card, CardContent } from "@/components/ui/card";

export default async function MyPostsPage() {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }
  
  // Get user posts
  const userPosts = await prisma.post.findMany({
    where: {
      authorId: user.id
    },
    orderBy: {
      createdAt: "desc"
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
        <h1 className="text-2xl font-bold">My Posts</h1>
        <p className="text-muted-foreground">
          View and manage your posts
        </p>
      </div>
      
      {userPosts.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <p>You haven&apos;t created any posts yet.</p>
          </CardContent>
        </Card>
      ) : (
        <PostList posts={userPosts} currentUserId={user.id} />
      )}
    </div>
  );
} 