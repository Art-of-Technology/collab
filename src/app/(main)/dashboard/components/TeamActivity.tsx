'use client';

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useRecentActivities } from "@/hooks/queries/useDashboard";
import { CollabText } from "@/components/ui/collab-text";

interface TeamActivityProps {
  workspaceId: string;
  initialActivities?: any[];
}

export function TeamActivity({ workspaceId, initialActivities }: TeamActivityProps) {
  // Use TanStack Query for data fetching with initial data from server
  const { data: activities = initialActivities || [], isLoading, error } = useRecentActivities(workspaceId);

  if (isLoading && !initialActivities?.length) {
    return (
      <Card className="bg-card/90 backdrop-blur-sm shadow-md border-border/50 hover:shadow-lg transition-all duration-300">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-5 w-5 text-primary" />
            Recent Team Activity
          </CardTitle>
          <CardDescription>Latest updates from your colleagues</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-card/90 backdrop-blur-sm shadow-md border-border/50 hover:shadow-lg transition-all duration-300">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-5 w-5 text-primary" />
            Recent Team Activity
          </CardTitle>
          <CardDescription>Latest updates from your colleagues</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-4 text-center text-muted-foreground">
            Error loading activity data. Please try again.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
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
            activities.map((activity: any, index: number) => (
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
                      {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm mt-1">
                    {activity.type === "like" && activity.post ? (
                      <>
                        Liked <Link href={`/profile/${activity.post.author.id}`} className="font-medium hover:underline">{activity.post.author.name}&apos;s</Link> post:
                        <Link href={`/posts/${activity.post.id}`} className="text-primary hover:underline group-hover:text-primary/80">
                          <CollabText
                            content={activity.post.message}
                            small
                            asSpan
                          />
                        </Link>
                      </>
                    ) : activity.type === "comment" && activity.post ? (
                      <>
                        Commented on <Link href={`/profile/${activity.post.author.id}`} className="font-medium hover:underline">{activity.post.author.name}&apos;s</Link> post:
                        <Link href={`/posts/${activity.post.id}`} className="text-primary hover:underline group-hover:text-primary/80">
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
            <div className="py-4 text-center text-muted-foreground">
              No recent activity to show
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 