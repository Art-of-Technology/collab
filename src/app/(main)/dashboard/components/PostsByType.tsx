'use client';

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertTriangle, Lightbulb, HelpCircle, MessageSquare, Heart, Loader2 } from "lucide-react";
import { useRecentPostsByType } from "@/hooks/queries/useDashboard";

interface PostsByTypeProps {
  type: 'BLOCKER' | 'IDEA' | 'QUESTION';
  workspaceId: string;
  initialPosts?: any[];
}

export function PostsByType({ type, workspaceId, initialPosts }: PostsByTypeProps) {
  // Use TanStack Query for data fetching with initial data from server
  const { data: posts = initialPosts || [], isLoading } = useRecentPostsByType(type, workspaceId);
  
  // Truncate text to a specified length
  const truncateText = (text: string, maxLength: number) => {
    // First strip HTML tags
    const strippedText = text?.replace(/<[^>]*>?/gm, '') || '';
    if (strippedText.length <= maxLength) return strippedText;
    return strippedText.substring(0, maxLength) + "...";
  };
  
  // Type-specific UI elements
  const getTypeDetails = () => {
    switch (type) {
      case 'BLOCKER':
        return {
          icon: <AlertTriangle className="h-5 w-5 text-destructive" />,
          title: 'Active Blockers',
          description: 'Issues that need attention from the team',
          linkHref: '/timeline?filter=blockers',
          cardClass: 'bg-card/90 backdrop-blur-sm shadow-md border-border/50 hover:shadow-lg transition-all duration-300',
          badge: null
        };
      case 'IDEA':
        return {
          icon: <Lightbulb className="h-5 w-5 text-yellow-500" />,
          title: 'Recent Ideas',
          description: 'Creative suggestions from the team',
          linkHref: '/timeline?filter=ideas',
          cardClass: 'bg-card/90 backdrop-blur-sm shadow-md border-border/50 hover:shadow-lg transition-all duration-300',
          badge: <Badge variant="secondary" className="text-xs flex items-center gap-1 cursor-pointer hover:bg-secondary/80">
                  <Lightbulb className="h-3 w-3" />
                  IDEA
                </Badge>
        };
      case 'QUESTION':
        return {
          icon: <HelpCircle className="h-5 w-5 text-blue-500" />,
          title: 'Recent Questions',
          description: 'Questions that need answers from the team',
          linkHref: '/timeline?filter=questions',
          cardClass: 'bg-card/90 backdrop-blur-sm shadow-md border-border/50 hover:shadow-lg transition-all duration-300',
          badge: <Badge variant="outline" className="text-xs flex items-center gap-1 cursor-pointer hover:bg-muted">
                  <HelpCircle className="h-3 w-3" />
                  QUESTION
                </Badge>
        };
      default:
        return {
          icon: null,
          title: 'Posts',
          description: 'Recent posts',
          linkHref: '/timeline',
          cardClass: '',
          badge: null
        };
    }
  };
  
  const { icon, title, description, linkHref, cardClass, badge } = getTypeDetails();
  
  const renderBlockerPost = (post: any) => (
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
            {post.author.name} • {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
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
          {post.tags?.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {post.tags.map((tag: any) => (
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
  );
  
  const renderStandardPost = (post: any) => (
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
            {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
          </span>
          <Link href={linkHref}>
            {badge}
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
          {post.tags?.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {post.tags.map((tag: any) => (
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
  );
  
  if (isLoading && !initialPosts?.length) {
    return (
      <Card className={cardClass}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            {icon}
            {title}
          </CardTitle>
          <CardDescription>
            {description}
            <Link href={linkHref} className="ml-2 text-primary hover:underline">
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
    <Card className={cardClass}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xl">
          {icon}
          {title}
        </CardTitle>
        <CardDescription>
          {description}
          <Link href={linkHref} className="ml-2 text-primary hover:underline">
            View all
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {posts.length > 0 ? (
            type === 'BLOCKER' 
              ? posts.map(renderBlockerPost)
              : posts.map(renderStandardPost)
          ) : (
            <div className="py-4 text-center text-muted-foreground">
              No {type.toLowerCase()}s to show
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 