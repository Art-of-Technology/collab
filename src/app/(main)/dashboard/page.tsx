import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertTriangle, Lightbulb, MessageSquare, Heart, HelpCircle, Sparkles, TrendingUp, Tag, CheckCircle, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { verifyWorkspaceAccess } from "@/lib/workspace-helpers";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your team's development activity dashboard",
};

export default async function DashboardPage() {
  const session = await getAuthSession();

  if (!session?.user) {
    redirect("/login");
  }

  // Verify workspace access and redirect if needed
  const workspaceId = await verifyWorkspaceAccess(session.user);

  // Fetch recent blockers
  const latestBlockers = await prisma.post.findMany({
    take: 5,
    where: {
      type: "BLOCKER",
      workspaceId: workspaceId
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      author: true,
      tags: true,
      _count: {
        select: {
          comments: true,
          reactions: true,
        },
      },
    },
  });

  // Fetch recent ideas
  const latestIdeas = await prisma.post.findMany({
    take: 5,
    where: {
      type: "IDEA",
      workspaceId: workspaceId
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      author: true,
      tags: true,
      _count: {
        select: {
          comments: true,
          reactions: true,
        },
      },
    },
  });

  // Fetch recent questions
  const latestQuestions = await prisma.post.findMany({
    take: 5,
    where: {
      type: "QUESTION",
      workspaceId: workspaceId
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      author: true,
      tags: true,
      _count: {
        select: {
          comments: true,
          reactions: true,
        },
      },
    },
  });

  // Fetch user's own posts
  const userPosts = await prisma.post.findMany({
    take: 5,
    where: {
      authorId: session.user.id,
      workspaceId: workspaceId
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      tags: true,
      _count: {
        select: {
          comments: true,
          reactions: true,
        },
      },
    },
  });

  // Fetch popular tags
  const popularTags = await prisma.tag.findMany({
    take: 10,
    orderBy: {
      posts: {
        _count: "desc",
      },
    },
    where: {
      posts: {
        some: {
          workspaceId: workspaceId
        }
      }
    },
    include: {
      _count: {
        select: {
          posts: true,
        },
      },
    },
  });

  // Fetch posts with no comments (need attention)
  const unansweredPosts = await prisma.post.findMany({
    take: 5,
    where: {
      comments: {
        none: {},
      },
      type: {
        in: ["QUESTION", "BLOCKER"],
      },
      workspaceId: workspaceId
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      author: true,
      tags: true,
      _count: {
        select: {
          reactions: true,
        },
      },
    },
  });

  // Fetch team metrics
  const teamMetrics = await prisma.$transaction([
    prisma.post.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        },
        workspaceId: workspaceId
      },
    }),
    prisma.comment.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        },
        post: {
          workspaceId: workspaceId
        }
      },
    }),
    prisma.reaction.count({
      where: {
        post: {
          workspaceId: workspaceId
        }
      }
    }), // Count all reactions since there's no createdAt field
    prisma.post.count({
      where: {
        type: "BLOCKER",
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        },
        workspaceId: workspaceId
      },
    }),
  ]);

  // Fetch recent activity (comments and likes)
  const recentComments = await prisma.comment.findMany({
    take: 5,
    orderBy: {
      createdAt: "desc",
    },
    where: {
      post: {
        workspaceId: workspaceId
      }
    },
    include: {
      author: true,
      post: {
        include: {
          author: true,
        },
      },
    },
  });

  const recentLikes = await prisma.reaction.findMany({
    take: 5,
    where: {
      type: "LIKE",
      post: {
        workspaceId: workspaceId
      }
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      author: true,
      post: {
        include: {
          author: true,
        },
      },
    },
  });

  // Truncate text to a specified length
  const truncateText = (text: string, maxLength: number) => {
    // First strip HTML tags
    const strippedText = text.replace(/<[^>]*>?/gm, '');
    if (strippedText.length <= maxLength) return strippedText;
    return strippedText.substring(0, maxLength) + "...";
  };

  // Get badge variant based on post type
  const getPostBadgeVariant = (type: string) => {
    switch (type) {
      case "UPDATE":
        return "default";
      case "BLOCKER":
        return "destructive";
      case "IDEA":
        return "secondary";
      case "QUESTION":
        return "outline";
      default:
        return "default";
    }
  };

  // Filter out likes with null posts
  const validLikes = recentLikes.filter(like => like.post !== null);

  // Combine activities
  const activities = [
    ...recentComments.map(comment => ({
      type: "comment" as const,
      id: comment.id,
      createdAt: comment.createdAt,
      author: comment.author,
      message: comment.message,
      post: comment.post
    })),
    ...validLikes.map((like) => ({
      type: "like" as const,
      id: like.id,
      createdAt: like.createdAt,
      author: like.author,
      post: like.post,
    }))
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Welcome back, {session.user.name}</h1>
        <p className="text-muted-foreground">
          Here&apos;s what&apos;s happening in your development world today
        </p>
      </div>

      {/* Quick metrics section */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/90 backdrop-blur-sm shadow-md border-border/50 hover:shadow-lg transition-all duration-300">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="p-2 bg-primary/10 rounded-full">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <p className="text-2xl font-bold">{teamMetrics[0]}</p>
              <p className="text-sm text-muted-foreground">Posts this week</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/90 backdrop-blur-sm shadow-md border-border/50 hover:shadow-lg transition-all duration-300">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="p-2 bg-blue-500/10 rounded-full">
                <MessageSquare className="h-5 w-5 text-blue-500" />
              </div>
              <p className="text-2xl font-bold">{teamMetrics[1]}</p>
              <p className="text-sm text-muted-foreground">Comments this week</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/90 backdrop-blur-sm shadow-md border-border/50 hover:shadow-lg transition-all duration-300">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="p-2 bg-red-500/10 rounded-full">
                <Heart className="h-5 w-5 text-red-500" />
              </div>
              <p className="text-2xl font-bold">{teamMetrics[2]}</p>
              <p className="text-sm text-muted-foreground">Reactions this week</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/90 backdrop-blur-sm shadow-md border-border/50 hover:shadow-lg transition-all duration-300">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="p-2 bg-destructive/10 rounded-full">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <p className="text-2xl font-bold">{teamMetrics[3]}</p>
              <p className="text-sm text-muted-foreground">Active blockers</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Team Activity Section */}
        <Card className="bg-card/90 backdrop-blur-sm shadow-md border-border/50 hover:shadow-lg transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="h-5 w-5 text-primary" />
              Recent Team Activity
            </CardTitle>
            <CardDescription>Latest updates from your colleagues</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activities.length > 0 ? (
                activities.map((activity, index) => (
                  <div key={index} className="flex items-start gap-3 py-3 border-b border-border/30 last:border-0 group hover:bg-muted/50 rounded-lg p-2 transition-colors">
                    <Avatar className="h-8 w-8 border border-border/40">
                      <AvatarImage src={activity.author.image || undefined} alt={activity.author.name || "User"} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {activity.author.name?.charAt(0).toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                        <span className="font-semibold text-sm">
                          {activity.author.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(activity.createdAt, { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm mt-1">
                        {activity.type === "like" && activity.post ? (
                          <>
                            Liked <Link href={`/profile/${activity.post.author.id}`} className="font-medium hover:underline">{activity.post.author.name}&apos;s</Link> post:
                            <Link href={`/posts/${activity.post.id}`} className="text-primary hover:underline group-hover:text-primary/80">
                              &quot;{truncateText(activity.post.message, 60)}&quot;
                            </Link>
                          </>
                        ) : activity.type === "comment" && activity.post ? (
                          <>
                            Commented on <Link href={`/profile/${activity.post.author.id}`} className="font-medium hover:underline">{activity.post.author.name}&apos;s</Link> post:
                            <Link href={`/posts/${activity.post.id}`} className="text-primary hover:underline group-hover:text-primary/80">
                              &quot;{truncateText(activity.message || "", 60)}&quot;
                            </Link>
                          </>
                        ) : (
                          <span>Interacted with a post that no longer exists</span>
                        )}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-4 text-center text-muted-foreground">
                  No recent activity to show
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        {/* Your Recent Posts */}
        <Card className="bg-card/90 backdrop-blur-sm shadow-md border-border/50 hover:shadow-lg transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <User className="h-5 w-5 text-primary" />
              Your Recent Activity
            </CardTitle>
            <CardDescription>
              Posts you&apos;ve created recently
              <Link href="/my-posts" className="ml-2 text-primary hover:underline">
                View all
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {userPosts.length > 0 ? (
                userPosts.map((post) => (
                  <div key={post.id} className="flex items-start gap-3 py-3 border-b border-border/30 last:border-0 group hover:bg-muted/50 rounded-lg p-2 transition-colors">
                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(post.createdAt, { addSuffix: true })}
                        </span>
                        <Link href={`/timeline?filter=${post.type.toLowerCase()}s`}>
                          <Badge variant={getPostBadgeVariant(post.type)} className="text-xs cursor-pointer hover:bg-muted">
                            {post.type}
                          </Badge>
                        </Link>
                      </div>
                      <Link href={`/posts/${post.id}`} className="block mt-1 hover:underline">
                        <p className="text-sm">{truncateText(post.message, 100)}</p>
                      </Link>
                      <div className="flex gap-4 mt-2">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {post._count.comments}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Heart className="h-3 w-3" />
                          {post._count.reactions}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-4 text-center text-muted-foreground">
                  <p>You haven&apos;t created any posts yet</p>
                  <Button className="mt-2">
                    <Link href="/posts/create">Create your first post</Link>
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Your activity and unanswered questions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Blockers Section */}
        <Card className="bg-card/90 backdrop-blur-sm shadow-md border-border/50 hover:shadow-lg transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Active Blockers
            </CardTitle>
            <CardDescription>
              Issues that need attention from the team
              <Link href="/timeline?filter=blockers" className="ml-2 text-primary hover:underline">
                View all
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {latestBlockers.length > 0 ? (
                latestBlockers.map((post) => (
                  <div key={post.id} className="relative w-full rounded-lg border p-3 border-destructive/30 text-destructive bg-destructive/5 mb-3 hover:bg-destructive/10 transition-colors">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6 border border-border/40">
                          <AvatarImage src={post.author.image || undefined} alt={post.author.name || "User"} />
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {post.author.name?.charAt(0).toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <h5 className="text-sm font-medium leading-none">
                          {post.author.name} • {formatDistanceToNow(post.createdAt, { addSuffix: true })}
                        </h5>
                      </div>
                      <div className="text-xs">
                        {post.priority === "high" && <Badge variant="outline" className="bg-red-500/10">High Priority</Badge>}
                      </div>
                    </div>
                    <div className="text-sm mt-2">
                      <Link href={`/posts/${post.id}`} className="block hover:underline">
                        <p className="text-sm">{truncateText(post.message, 100)}</p>
                      </Link>
                      <div className="flex gap-4 mt-2">
                        <span className="text-xs flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {post._count.comments}
                        </span>
                        {post.tags.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {post.tags.map((tag) => (
                              <Link href={`/timeline?tag=${tag.name.toLowerCase()}`} key={tag.id}>
                                <Badge variant="outline" className="text-xs hover:bg-muted cursor-pointer">
                                  {tag.name}
                                </Badge>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-4 text-center text-muted-foreground">
                  No blockers to show
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Unanswered Questions/Blockers */}
        <Card className="bg-card/90 backdrop-blur-sm shadow-md border-border/50 hover:shadow-lg transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <CheckCircle className="h-5 w-5 text-orange-500" />
              Needs Attention
            </CardTitle>
            <CardDescription>Questions and blockers with no responses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {unansweredPosts.length > 0 ? (
                unansweredPosts.map((post) => (
                  <div key={post.id} className="flex items-start gap-3 py-3 border-b border-border/30 last:border-0 group hover:bg-muted/50 rounded-lg p-2 transition-colors">
                    <Avatar className="h-8 w-8 border border-border/40">
                      <AvatarImage src={post.author.image || undefined} alt={post.author.name || "User"} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {post.author.name?.charAt(0).toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                        <Link href={`/profile/${post.author.id}`} className="font-semibold text-sm hover:underline">
                          {post.author.name}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(post.createdAt, { addSuffix: true })}
                        </span>
                        <Link href={`/timeline?filter=${post.type.toLowerCase()}s`}>
                          <Badge variant={getPostBadgeVariant(post.type)} className="text-xs cursor-pointer hover:bg-muted">
                            {post.type}
                          </Badge>
                        </Link>
                      </div>
                      <Link href={`/posts/${post.id}`} className="block mt-1 hover:underline">
                        <p className="text-sm">{truncateText(post.message, 100)}</p>
                      </Link>
                      <div className="flex gap-4 mt-2">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          0
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Heart className="h-3 w-3" />
                          {post._count.reactions}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-4 text-center text-muted-foreground">
                  No unanswered posts at the moment
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ideas Section */}
        <Card className="bg-card/90 backdrop-blur-sm shadow-md border-border/50 hover:shadow-lg transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Lightbulb className="h-5 w-5 text-yellow-500" />
              Recent Ideas
            </CardTitle>
            <CardDescription>
              Creative suggestions from the team
              <Link href="/timeline?filter=ideas" className="ml-2 text-primary hover:underline">
                View all
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {latestIdeas.length > 0 ? (
                latestIdeas.map((post) => (
                  <div key={post.id} className="flex items-start gap-3 py-3 border-b border-border/30 last:border-0 group hover:bg-muted/50 rounded-lg p-2 transition-colors">
                    <Avatar className="h-8 w-8 border border-border/40">
                      <AvatarImage src={post.author.image || undefined} alt={post.author.name || "User"} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {post.author.name?.charAt(0).toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                        <Link href={`/profile/${post.author.id}`} className="font-semibold text-sm hover:underline">
                          {post.author.name}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(post.createdAt, { addSuffix: true })}
                        </span>
                        <Link href="/timeline?filter=ideas">
                          <Badge variant="secondary" className="text-xs flex items-center gap-1 cursor-pointer hover:bg-secondary/80">
                            <Lightbulb className="h-3 w-3" />
                            IDEA
                          </Badge>
                        </Link>
                      </div>
                      <Link href={`/posts/${post.id}`} className="block mt-1 hover:underline">
                        <p className="text-sm">{truncateText(post.message, 100)}</p>
                      </Link>
                      <div className="flex gap-4 mt-2">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {post._count.comments}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Heart className="h-3 w-3" />
                          {post._count.reactions}
                        </span>
                        {post.tags.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {post.tags.map((tag) => (
                              <Link href={`/timeline?tag=${tag.name.toLowerCase()}`} key={tag.id}>
                                <Badge variant="outline" className="text-xs hover:bg-muted cursor-pointer">
                                  {tag.name}
                                </Badge>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-4 text-center text-muted-foreground">
                  No ideas to show
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Popular Tags Section */}
        <div className="grid grid-cols-1 gap-6">
          <Card className="bg-card/90 backdrop-blur-sm shadow-md border-border/50 hover:shadow-lg transition-all duration-300">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Tag className="h-5 w-5 text-primary" />
                Popular Tags
              </CardTitle>
              <CardDescription>Trending topics in your team</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {popularTags.length > 0 ? (
                  popularTags.map((tag) => (
                    <Link href={`/timeline?tag=${tag.name.toLowerCase()}`} key={tag.id}>
                      <Badge
                        variant="outline"
                        className="text-sm py-2 px-3 hover:bg-primary/10 cursor-pointer transition-colors"
                      >
                        <span className="mr-1 font-normal">{tag.name}</span>
                        <span className="opacity-60">{tag._count.posts}</span>
                      </Badge>
                    </Link>
                  ))
                ) : (
                  <div className="py-4 text-center text-muted-foreground w-full">
                    No tags to show
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Questions Section */}
          <Card className="bg-card/90 backdrop-blur-sm shadow-md border-border/50 hover:shadow-lg transition-all duration-300">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-xl">
                <HelpCircle className="h-5 w-5 text-blue-500" />
                Recent Questions
              </CardTitle>
              <CardDescription>
                Questions that need answers from the team
                <Link href="/timeline?filter=questions" className="ml-2 text-primary hover:underline">
                  View all
                </Link>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {latestQuestions.length > 0 ? (
                  latestQuestions.map((post) => (
                    <div key={post.id} className="flex items-start gap-3 py-3 border-b border-border/30 last:border-0 group hover:bg-muted/50 rounded-lg p-2 transition-colors">
                      <Avatar className="h-8 w-8 border border-border/40">
                        <AvatarImage src={post.author.image || undefined} alt={post.author.name || "User"} />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {post.author.name?.charAt(0).toUpperCase() || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                          <Link href={`/profile/${post.author.id}`} className="font-semibold text-sm hover:underline">
                            {post.author.name}
                          </Link>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(post.createdAt, { addSuffix: true })}
                          </span>
                          <Link href="/timeline?filter=questions">
                            <Badge variant="outline" className="text-xs flex items-center gap-1 cursor-pointer hover:bg-muted">
                              <HelpCircle className="h-3 w-3" />
                              QUESTION
                            </Badge>
                          </Link>
                        </div>
                        <Link href={`/posts/${post.id}`} className="block mt-1 hover:underline">
                          <p className="text-sm">{truncateText(post.message, 100)}</p>
                        </Link>
                        <div className="flex gap-4 mt-2">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />
                            {post._count.comments}
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Heart className="h-3 w-3" />
                            {post._count.reactions}
                          </span>
                          {post.tags.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                              {post.tags.map((tag) => (
                                <Link href={`/timeline?tag=${tag.name.toLowerCase()}`} key={tag.id}>
                                  <Badge variant="outline" className="text-xs hover:bg-muted cursor-pointer">
                                    {tag.name}
                                  </Badge>
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-4 text-center text-muted-foreground">
                    No questions to show
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
} 