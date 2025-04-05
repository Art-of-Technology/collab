'use client';

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpCircle, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUnansweredPosts } from "@/hooks/queries/useDashboard";
import { Badge } from "@/components/ui/badge";

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
  // Use TanStack Query for data fetching with initial data from server
  const { data: unansweredPosts = initialPosts || [], isLoading } = useUnansweredPosts(workspaceId);

  const truncateText = (text: string, maxLength = 120) => {
    // Strip HTML tags
    const strippedText = text.replace(/<[^>]*>/g, '');
    
    if (strippedText.length <= maxLength) return strippedText;
    return `${strippedText.substring(0, maxLength)}...`;
  };

  if (isLoading && !initialPosts?.length) {
    return (
      <Card className="bg-card/90 backdrop-blur-sm shadow-md border-border/50 hover:shadow-lg transition-all duration-300">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <HelpCircle className="h-5 w-5 text-amber-500" />
            Unanswered Posts
          </CardTitle>
          <CardDescription>Help your teammates with these posts</CardDescription>
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
          <HelpCircle className="h-5 w-5 text-amber-500" />
          Unanswered Posts
        </CardTitle>
        <CardDescription>Help your teammates with these posts</CardDescription>
      </CardHeader>
      <CardContent>
        {unansweredPosts.length > 0 ? (
          <div className="space-y-3">
            {unansweredPosts.map((post) => (
              <Link href={`/posts/${post.id}`} key={post.id} className="block">
                <div className="border rounded-md p-3 hover:bg-accent/50 transition-colors">
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={post.author.image || ''} alt={post.author.name || ''} />
                        <AvatarFallback>{post.author.name?.substring(0, 2).toUpperCase() || ''}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{post.author.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <Badge variant={post.type === 'BLOCKER' ? 'destructive' : post.type === 'IDEA' ? 'default' : 'secondary'}>
                      {post.type.charAt(0) + post.type.slice(1).toLowerCase()}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{truncateText(post.message)}</p>
                  {post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {post.tags.map((tag: Tag) => (
                        <Badge variant="outline" key={tag.id} className="text-xs px-1.5 py-0">
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
          <div className="py-4 text-center text-muted-foreground">
            No unanswered posts at the moment
          </div>
        )}
      </CardContent>
    </Card>
  );
} 