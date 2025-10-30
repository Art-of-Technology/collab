'use client';

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tag, Loader2 } from "lucide-react";
import { usePopularTags } from "@/hooks/queries/useDashboard";
import { useWorkspace } from "@/context/WorkspaceContext";

interface TagType {
  id: string;
  name: string;
  _count: {
    posts: number;
  };
}

interface PopularTagsProps {
  workspaceId: string;
  initialTags?: TagType[];
}

export function PopularTags({ workspaceId, initialTags }: PopularTagsProps) {
  const { currentWorkspace } = useWorkspace();
  const effectiveWorkspaceId = currentWorkspace?.id || workspaceId;
  // Use TanStack Query for data fetching with initial data from server
  const { data: popularTags = initialTags || [], isLoading } = usePopularTags(effectiveWorkspaceId);
  
  if (isLoading && !initialTags?.length) {
    return (
      <Card className="border border-border/40 bg-card/50">
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Tag className="h-4 w-4 text-muted-foreground" />
            Popular Tags
          </CardTitle>
          <CardDescription className="text-xs">Trending topics in your team</CardDescription>
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
          <Tag className="h-4 w-4 text-muted-foreground" />
          Popular Tags
        </CardTitle>
        <CardDescription className="text-xs">Trending topics in your team</CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="flex flex-wrap gap-1.5">
          {popularTags.length > 0 ? (
            popularTags.map((tag: TagType) => (
              <Link href={currentWorkspace ? `/${currentWorkspace.id}/timeline?tag=${tag.name.toLowerCase()}` : '#'} key={tag.id}>
                <Badge
                  variant="outline"
                  className="text-xs py-1 px-2 hover:bg-muted/50 cursor-pointer transition-colors h-6"
                >
                  <span className="mr-1 font-normal">{tag.name}</span>
                  <span className="opacity-60">{tag._count.posts}</span>
                </Badge>
              </Link>
            ))
          ) : (
            <div className="py-3 text-center text-muted-foreground text-sm w-full">
              No tags to show
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 