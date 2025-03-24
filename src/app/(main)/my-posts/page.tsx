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
  
  // Get user's posts
  const myPosts = await prisma.post.findMany({
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
      <h1 className="text-2xl font-bold mb-6">My Posts</h1>
      
      {myPosts.length > 0 ? (
        <PostList posts={myPosts} currentUserId={user.id} />
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <p>You haven't created any posts yet.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 