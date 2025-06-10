'use client';

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, MessageSquare, Heart, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserPosts } from "@/hooks/queries/useDashboard";
import { CollabText } from "@/components/ui/collab-text";
import { useWorkspace } from "@/context/WorkspaceContext";

interface UserPostsProps {
  userId: string;
  workspaceId: string;
  initialUserPosts?: any[];
}

export function UserPosts({ userId, workspaceId, initialUserPosts }: UserPostsProps) {
  const { currentWorkspace } = useWorkspace();
  // Use TanStack Query for data fetching with initial data from server
  const { data: userPosts = initialUserPosts || [], isLoading } = useUserPosts(userId, workspaceId);

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

  if (isLoading && !initialUserPosts?.length) {
    return (
      <Card className="bg-card/90 backdrop-blur-sm shadow-md border-border/50 hover:shadow-lg transition-all duration-300">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <User className="h-5 w-5 text-primary" />
            Your Recent Activity
          </CardTitle>
          <CardDescription>
            Posts you&apos;ve created recently
            <Link href={currentWorkspace ? `/${currentWorkspace.id}/profile` : '#'} className="ml-2 text-primary hover:underline">
              View all
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/90 backdrop-blur-sm shadow-md border-border/50 hover:shadow-lg transition-all duration-300">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xl">
          <User className="h-5 w-5 text-primary" />
          Your Recent Activity
        </CardTitle>
        <CardDescription>
          Posts you&apos;ve created recently
          <Link href={currentWorkspace ? `/${currentWorkspace.id}/profile` : '#'} className="ml-2 text-primary hover:underline">
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
                      {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                    </span>
                    <Link href={currentWorkspace ? `/${currentWorkspace.id}/timeline?filter=${post.type.toLowerCase()}s` : '#'}>
                      <Badge variant={getPostBadgeVariant(post.type)} className="text-xs cursor-pointer hover:bg-muted">
                        {post.type}
                      </Badge>
                    </Link>
                  </div>
                  <Link href={currentWorkspace ? `/${currentWorkspace.id}/posts/${post.id}` : '#'} className="block mt-1 hover:underline">
                    <p className="text-sm">
                      <CollabText
                        content={post.message}
                        small
                        asSpan
                      />
                    </p>
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
                <Link href={currentWorkspace ? `/${currentWorkspace.id}/timeline` : '#'}>Create your first post</Link>
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 