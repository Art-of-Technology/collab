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
      <Card className="border border-border/40 bg-card/50">
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <User className="h-4 w-4 text-muted-foreground" />
            Your Recent Activity
          </CardTitle>
          <CardDescription className="text-xs">
            Posts you&apos;ve created recently
            <Link href={currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}/profile` : '#'} className="ml-1 text-foreground hover:underline">
              View all
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-border/40 bg-card/50">
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <User className="h-4 w-4 text-muted-foreground" />
          Your Recent Activity
        </CardTitle>
        <CardDescription className="text-xs">
          Posts you&apos;ve created recently
          <Link href={currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}/profile` : '#'} className="ml-1 text-foreground hover:underline">
            View all
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="space-y-2">
          {userPosts.length > 0 ? (
            userPosts.map((post) => (
              <div key={post.id} className="flex items-start gap-2 py-2 border-b border-border/20 last:border-0 group hover:bg-muted/30 rounded px-2 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1.5">
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                    </span>
                    <Link href={currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}/timeline?filter=${post.type.toLowerCase()}s` : '#'}>
                      <Badge variant={getPostBadgeVariant(post.type)} className="text-xs cursor-pointer hover:bg-muted h-4 px-1.5">
                        {post.type}
                      </Badge>
                    </Link>
                  </div>
                  <Link href={currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}/posts/${post.id}` : '#'} className="block mt-0.5 hover:underline">
                    <p className="text-xs text-muted-foreground">
                      <CollabText
                        content={post.message}
                        small
                        asSpan
                      />
                    </p>
                  </Link>
                  <div className="flex gap-3 mt-1">
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
            <div className="py-3 text-center text-muted-foreground">
              <p className="text-sm">You haven&apos;t created any posts yet</p>
              <Button size="sm" className="mt-2">
                <Link href={currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}/timeline` : '#'}>Create your first post</Link>
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 