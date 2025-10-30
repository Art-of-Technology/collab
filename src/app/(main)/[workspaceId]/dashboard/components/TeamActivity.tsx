'use client';

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useRecentActivities } from "@/hooks/queries/useDashboard";
import { CollabText } from "@/components/ui/collab-text";
import { useWorkspace } from "@/context/WorkspaceContext";

interface TeamActivityProps {
  workspaceId: string;
  initialActivities?: any[];
}

export function TeamActivity({ workspaceId, initialActivities }: TeamActivityProps) {
  const { currentWorkspace } = useWorkspace();
  const effectiveWorkspaceId = currentWorkspace?.id || workspaceId;
  // Use TanStack Query for data fetching with initial data from server
  const { data: activities = initialActivities || [], isLoading, error } = useRecentActivities(effectiveWorkspaceId);

  if (isLoading && !initialActivities?.length) {
    return (
      <Card className="border border-border/40 bg-card/50">
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            Recent Team Activity
          </CardTitle>
          <CardDescription className="text-xs">Latest updates from your colleagues</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border border-border/40 bg-card/50">
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            Recent Team Activity
          </CardTitle>
          <CardDescription className="text-xs">Latest updates from your colleagues</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="py-3 text-center text-muted-foreground text-sm">
            Error loading activity data. Please try again.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-border/40 bg-card/50">
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          Recent Team Activity
        </CardTitle>
        <CardDescription className="text-xs">Latest updates from your colleagues</CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="space-y-2">
          {activities.length > 0 ? (
            activities.map((activity: any, index: number) => (
              <div key={index} className="flex items-start gap-2.5 py-2 border-b border-border/20 last:border-0 group hover:bg-muted/30 rounded px-2 transition-colors">
                <Avatar className="h-6 w-6 border border-border/30">
                  <AvatarImage src={activity.author.image || undefined} alt={activity.author.name || "User"} />
                  <AvatarFallback className="bg-muted/50 text-muted-foreground text-xs">
                    {activity.author.name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1.5">
                    <span className="font-medium text-xs">
                      {activity.author.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-xs mt-0.5 text-muted-foreground">
                    {activity.type === "like" && activity.post ? (
                      <>
                        Liked <Link href={currentWorkspace ? `/${currentWorkspace.id}/profile/${activity.post.author.id}` : '#'} className="font-medium hover:underline">{activity.post.author.name}&apos;s</Link> post:
                        <Link href={currentWorkspace ? `/${currentWorkspace.id}/posts/${activity.post.id}` : '#'} className="text-foreground hover:underline">
                          <CollabText
                            content={activity.post.message}
                            small
                            asSpan
                          />
                        </Link>
                      </>
                    ) : activity.type === "comment" && activity.post ? (
                      <>
                        Commented on <Link href={currentWorkspace ? `/${currentWorkspace.id}/profile/${activity.post.author.id}` : '#'} className="font-medium hover:underline">{activity.post.author.name}&apos;s</Link> post:
                        <Link href={currentWorkspace ? `/${currentWorkspace.id}/posts/${activity.post.id}` : '#'} className="text-foreground hover:underline">
                          <CollabText
                            content={activity.message}
                            small
                            asSpan
                          />
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
            <div className="py-3 text-center text-muted-foreground text-sm">
              No recent activity to show
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 