import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PostList from "@/components/posts/PostList";

export default async function UserProfilePage({
  params
}: {
  params: { userId: string }
}) {
  const currentUser = await getCurrentUser();
  
  if (!currentUser) {
    redirect("/login");
  }
  
  // Check if viewing own profile
  if (currentUser.id === params.userId) {
    redirect("/profile");
  }
  
  // Get the requested user
  const user = await prisma.user.findUnique({
    where: {
      id: params.userId
    }
  });
  
  if (!user) {
    redirect("/404");
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
  
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 overflow-x-hidden">
      <Card className="mb-8 border-border/40 bg-card/95 shadow-lg hover:shadow-xl transition-all duration-300">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 border-2 border-primary/20 shadow-md">
              <AvatarImage src={user.image || undefined} alt={user.name || "User"} />
              <AvatarFallback className="text-lg bg-primary/10 text-primary">
                {user.name?.charAt(0).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold">{user.name}</h1>
              <p className="text-muted-foreground">{user.role || "Developer"}</p>
            </div>
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
      
      <Tabs defaultValue="posts" className="mb-8">
        <TabsList className="bg-card/80 border border-border/40">
          <TabsTrigger value="posts" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Posts</TabsTrigger>
          <TabsTrigger value="about" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">About</TabsTrigger>
        </TabsList>
        <TabsContent value="posts" className="mt-4">
          {userPosts.length > 0 ? (
            <PostList posts={userPosts} currentUserId={currentUser.id} />
          ) : (
            <Card className="border-border/40 bg-card/95 shadow-md">
              <CardContent className="p-8 text-center text-muted-foreground">
                <p>This user hasn't created any posts yet.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="about" className="mt-4">
          <Card className="border-border/40 bg-card/95 shadow-md">
            <CardContent className="p-6">
              {user.expertise && user.expertise.length > 0 ? (
                <div className="mb-4">
                  <h3 className="text-lg font-semibold mb-2">Expertise</h3>
                  <div className="flex flex-wrap gap-2">
                    {(user.expertise as string[]).map((skill, index) => (
                      <span key={index} className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm border border-primary/20 hover:bg-primary/20 transition-colors">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              
              {user.currentFocus ? (
                <div>
                  <h3 className="text-lg font-semibold mb-2">Current Focus</h3>
                  <p className="text-muted-foreground">{user.currentFocus}</p>
                </div>
              ) : (
                <p className="text-muted-foreground text-center">This user hasn't added any information yet.</p>
              )}
              
              {user.team && (
                <div className="mt-4">
                  <h3 className="text-lg font-semibold mb-2">Team</h3>
                  <p className="text-muted-foreground">{user.team}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 