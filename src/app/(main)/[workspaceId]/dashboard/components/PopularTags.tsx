'use client';

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tag, Loader2 } from "lucide-react";
import { usePopularTags } from "@/hooks/queries/useDashboard";

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
  // Use TanStack Query for data fetching with initial data from server
  const { data: popularTags = initialTags || [], isLoading } = usePopularTags(workspaceId);
  
  if (isLoading && !initialTags?.length) {
    return (
      <Card className="bg-card/90 backdrop-blur-sm shadow-md border-border/50 hover:shadow-lg transition-all duration-300">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Tag className="h-5 w-5 text-primary" />
            Popular Tags
          </CardTitle>
          <CardDescription>Trending topics in your team</CardDescription>
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
          <Tag className="h-5 w-5 text-primary" />
          Popular Tags
        </CardTitle>
        <CardDescription>Trending topics in your team</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {popularTags.length > 0 ? (
            popularTags.map((tag: TagType) => (
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
  );
} 