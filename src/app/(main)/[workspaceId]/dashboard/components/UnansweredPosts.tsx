'use client';

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpCircle, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUnansweredPosts } from "@/hooks/queries/useDashboard";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/context/WorkspaceContext";

interface Tag {
  id: string;
  name: string;
}

// Using a more generic interface that matches the server response
interface Post {
  id: string;
  message: string;
  type: string;
  createdAt: string | Date;
  author: {
    name: string | null;
    image: string | null;
  };
  tags: Tag[];
  [key: string]: any; // Allow for additional properties
}

interface UnansweredPostsProps {
  workspaceId: string;
  initialPosts?: Post[];
}

export function UnansweredPosts({ workspaceId, initialPosts }: UnansweredPostsProps) {
  const { currentWorkspace } = useWorkspace();
  const effectiveWorkspaceId = currentWorkspace?.id || workspaceId;
  // Use TanStack Query for data fetching with initial data from server
  const { data: unansweredPosts = initialPosts || [], isLoading } = useUnansweredPosts(effectiveWorkspaceId);

  const truncateText = (text: string, maxLength = 120) => {
    // Strip HTML tags
    const strippedText = text.replace(/<[^>]*>/g, '');

    if (strippedText.length <= maxLength) return strippedText;
    return `${strippedText.substring(0, maxLength)}...`;
  };

  if (isLoading && !initialPosts?.length) {
    return (
      <Card className="border border-border/40 bg-card/50">
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
            Unanswered Posts
          </CardTitle>
          <CardDescription className="text-xs">Help your teammates with these posts</CardDescription>
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
          <HelpCircle className="h-4 w-4 text-muted-foreground" />
          Unanswered Posts
        </CardTitle>
        <CardDescription className="text-xs">Help your teammates with these posts</CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {unansweredPosts.length > 0 ? (
          <div className="space-y-2">
            {unansweredPosts.map((post) => (
              <Link href={currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}/posts/${post.id}` : '#'} key={post.id} className="block">
                <div className="border rounded p-2 hover:bg-muted/30 transition-colors border-border/20">
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center gap-1.5">
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={post.author.image || ''} alt={post.author.name || ''} />
                        <AvatarFallback className="text-xs">{post.author.name?.substring(0, 2).toUpperCase() || ''}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-medium">{post.author.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <Badge variant={post.type === 'BLOCKER' ? 'destructive' : post.type === 'IDEA' ? 'default' : 'secondary'} className="h-4 px-1.5 text-xs">
                      {post.type.charAt(0) + post.type.slice(1).toLowerCase()}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{truncateText(post.message)}</p>
                  {post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {post.tags.map((tag: Tag) => (
                        <Badge variant="outline" key={tag.id} className="text-xs px-1.5 h-4">
                          {tag.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="py-3 text-center text-muted-foreground text-sm">
            No unanswered posts at the moment
          </div>
        )}
      </CardContent>
    </Card>
  );
} 