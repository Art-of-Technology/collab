import { getCurrentUser } from "@/lib/session";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import PostList from "@/components/posts/PostList";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

interface UserProfilePageProps {
  params: {
    userId: string;
  };
}

export default async function UserProfilePage({ params }: UserProfilePageProps) {
  const { userId } = params;
  const currentUser = await getCurrentUser();
  
  if (!currentUser) {
    redirect("/login");
  }
  
  // If this is the current user's profile, redirect to /profile
  if (userId === currentUser.id) {
    redirect("/profile");
  }
  
  // Get the user
  const user = await prisma.user.findUnique({
    where: {
      id: userId
    }
  });
  
  if (!user) {
    notFound();
  }
  
  // Get user's posts
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
  
  // Get stats
  const postCount = userPosts.length;
  const commentCount = await prisma.comment.count({
    where: {
      authorId: user.id
    }
  });
  const reactionsReceived = await prisma.reaction.count({
    where: {
      post: {
        authorId: user.id
      }
    }
  });
  
  // Check if there's a conversation between the users already
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
              id: user.id
            }
          }
        }
      ]
    }
  });
  
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 overflow-x-hidden">
      <div className="flex items-center gap-2 mb-6">
        <Button asChild variant="ghost" size="icon">
          <Link href="/timeline">
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-xl font-bold">User Profile</h1>
      </div>
      
      <Card className="mb-8 border-border/40 bg-card/95 shadow-lg hover:shadow-xl transition-all duration-300">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 border-2 border-primary/20 shadow-md">
                <AvatarImage src={user.image || undefined} alt={user.name || "User"} />
                <AvatarFallback className="text-lg bg-primary/10 text-primary">
                  {user.name?.charAt(0).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-2xl font-bold">{user.name}</h2>
                <p className="text-muted-foreground">{user.role || "Developer"}</p>
                {user.team && (
                  <p className="text-sm text-muted-foreground">Team: {user.team}</p>
                )}
              </div>
            </div>
            
            <Button asChild variant="outline">
              <Link href={existingConversation ? `/messages/${existingConversation.id}` : `/messages/new/${user.id}`}>
                Message
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between mt-4 mb-6">
            <div className="text-center p-3 hover:bg-primary/5 rounded-lg transition-colors">
              <p className="text-2xl font-semibold">{postCount}</p>
              <p className="text-muted-foreground text-sm">Posts</p>
            </div>
            <div className="text-center p-3 hover:bg-primary/5 rounded-lg transition-colors">
              <p className="text-2xl font-semibold">{commentCount}</p>
              <p className="text-muted-foreground text-sm">Comments</p>
            </div>
            <div className="text-center p-3 hover:bg-primary/5 rounded-lg transition-colors">
              <p className="text-2xl font-semibold">{reactionsReceived}</p>
              <p className="text-muted-foreground text-sm">Reactions</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card className="border-border/40 bg-card/95 shadow-md">
        <CardHeader className="pb-2 border-b border-border/40">
          <h2 className="text-xl font-semibold">{user.name}&apos;s Posts</h2>
        </CardHeader>
        <CardContent className="pt-4">
          {userPosts.length > 0 ? (
            <PostList posts={userPosts} currentUserId={currentUser.id} />
          ) : (
            <div className="p-4 text-center text-muted-foreground">
              <p>This user hasn&apos;t created any posts yet.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 