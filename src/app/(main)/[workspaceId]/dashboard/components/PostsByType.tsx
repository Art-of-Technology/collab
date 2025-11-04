'use client';

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Lightbulb, HelpCircle, MessageSquare, Heart, Loader2, CheckCircle } from "lucide-react";
import { useRecentPostsByType } from "@/hooks/queries/useDashboard";
import { CollabText } from "@/components/ui/collab-text";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useResolvePost } from "@/hooks/queries/useResolvePost";
import { useCurrentUser } from "@/hooks/queries/useUser";
import { usePermissions } from "@/hooks/use-permissions";
import { Permission } from "@/lib/permissions";

interface PostsByTypeProps {
  type: 'BLOCKER' | 'IDEA' | 'QUESTION';
  workspaceId: string;
  initialPosts?: any[];
}

export function PostsByType({ type, workspaceId, initialPosts }: PostsByTypeProps) {
  const { currentWorkspace } = useWorkspace();
  const effectiveWorkspaceId = currentWorkspace?.id || workspaceId;
  const { data: currentUser } = useCurrentUser();
  const resolvePostMutation = useResolvePost();
  const { checkPermission, isSystemAdmin } = usePermissions(effectiveWorkspaceId);

  // Use TanStack Query for data fetching with initial data from server
  const { data: posts = initialPosts || [], isLoading } = useRecentPostsByType(type, effectiveWorkspaceId);

  // Check if user can resolve blocker posts
  const canResolveBlocker = (post: any) => {
    if (post.type !== 'BLOCKER') return false;

    const isAuthor = post.authorId === currentUser?.id;
    const isWorkspaceOwner = currentUser?.id === currentWorkspace?.ownerId;
    const canResolvePost = checkPermission(Permission.RESOLVE_BLOCKER).hasPermission;
    const isAdminUser = isSystemAdmin();

    return isAuthor || isWorkspaceOwner || canResolvePost || isAdminUser;
  };

  const handleResolve = (postId: string) => {
    resolvePostMutation.mutate(postId);
  };

  // Type-specific UI elements
  const getTypeDetails = () => {
    const baseUrl = currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}` : '';

    switch (type) {
      case 'BLOCKER':
        return {
          icon: <AlertTriangle className="h-4 w-4 text-muted-foreground" />,
          title: 'Active Blockers',
          description: 'Issues that need attention from the team',
          linkHref: `${baseUrl}/timeline?filter=blockers`,
          cardClass: 'border border-border/40 bg-card/50',
          badge: null
        };
      case 'IDEA':
        return {
          icon: <Lightbulb className="h-4 w-4 text-muted-foreground" />,
          title: 'Recent Ideas',
          description: 'Creative suggestions from the team',
          linkHref: `${baseUrl}/timeline?filter=ideas`,
          cardClass: 'border border-border/40 bg-card/50',
          badge: <Badge variant="secondary" className="text-xs flex items-center gap-1 cursor-pointer hover:bg-secondary/80 h-4 px-1.5">
            <Lightbulb className="h-3 w-3" />
            IDEA
          </Badge>
        };
      case 'QUESTION':
        return {
          icon: <HelpCircle className="h-4 w-4 text-muted-foreground" />,
          title: 'Recent Questions',
          description: 'Questions that need answers from the team',
          linkHref: `${baseUrl}/timeline?filter=questions`,
          cardClass: 'border border-border/40 bg-card/50',
          badge: <Badge variant="outline" className="text-xs flex items-center gap-1 cursor-pointer hover:bg-muted h-4 px-1.5">
            <HelpCircle className="h-3 w-3" />
            QUESTION
          </Badge>
        };
      default:
        return {
          icon: null,
          title: 'Posts',
          description: 'Recent posts',
          linkHref: `${baseUrl}/timeline`,
          cardClass: '',
          badge: null
        };
    }
  };

  const { icon, title, description, linkHref, cardClass, badge } = getTypeDetails();

  const renderBlockerPost = (post: any) => (
    <div key={post.id} className="relative w-full rounded-lg border p-2.5 border-destructive/30 text-destructive bg-destructive/5 mb-2 hover:bg-destructive/10 transition-colors">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
          <Avatar className="h-5 w-5 border border-border/40">
            <AvatarImage src={post.author.image || undefined} alt={post.author.name || "User"} />
            <AvatarFallback className="bg-muted/50 text-muted-foreground text-xs">
              {post.author.name?.charAt(0).toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <h5 className="text-xs font-medium leading-none">
            {post.author.name} • {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
          </h5>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          {post.priority === "high" && <Badge variant="outline" className="bg-red-500/10 h-4 px-1.5">High Priority</Badge>}
          {canResolveBlocker(post) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleResolve(post.id)}
              disabled={resolvePostMutation.isPending}
              className="h-5 px-1.5 text-xs bg-green-50 border-green-200 text-green-800 hover:bg-green-100 hover:border-green-300 hover:text-green-900"
            >
              <CheckCircle className="h-3 w-3 mr-1" />
              {resolvePostMutation.isPending ? 'Resolving...' : 'Mark Resolved'}
            </Button>
          )}
        </div>
      </div>
      <div className="text-xs mt-1.5">
        <Link href={currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}/posts/${post.id}` : '#'} className="block hover:underline">
          <p className="text-xs">
            <CollabText
              content={post.message}
              small
              asSpan
            />
          </p>
        </Link>
        <div className="flex gap-3 mt-1.5">
          <span className="text-xs flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            {post._count.comments}
          </span>
          {post.tags?.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {post.tags.map((tag: any) => (
                <Link href={currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}/timeline?tag=${tag.name.toLowerCase()}` : '#'} key={tag.id}>
                  <Badge variant="outline" className="text-xs hover:bg-muted cursor-pointer h-4 px-1.5">
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
    <div key={post.id} className="flex items-start gap-2 py-2 border-b border-border/20 last:border-0 group hover:bg-muted/30 rounded px-2 transition-colors">
      <Avatar className="h-6 w-6 border border-border/30">
        <AvatarImage src={post.author.image || undefined} alt={post.author.name || "User"} />
        <AvatarFallback className="bg-muted/50 text-muted-foreground text-xs">
          {post.author.name?.charAt(0).toUpperCase() || "U"}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1.5">
          <Link href={currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}/profile/${post.author.id}` : '#'} className="font-medium text-xs hover:underline">
            {post.author.name}
          </Link>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
          </span>
          <Link href={linkHref}>
            {badge}
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
          {post.tags?.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {post.tags.map((tag: any) => (
                <Link href={currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}/timeline?tag=${tag.name.toLowerCase()}` : '#'} key={tag.id}>
                  <Badge variant="outline" className="text-xs hover:bg-muted cursor-pointer h-4 px-1.5">
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
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            {icon}
            {title}
          </CardTitle>
          <CardDescription className="text-xs">
            {description}
            <Link href={linkHref} className="ml-1 text-foreground hover:underline">
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
    <Card className={cardClass}>
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          {icon}
          {title}
        </CardTitle>
        <CardDescription className="text-xs">
          {description}
          <Link href={linkHref} className="ml-1 text-foreground hover:underline">
            View all
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="space-y-2">
          {posts.length > 0 ? (
            type === 'BLOCKER'
              ? posts.map(renderBlockerPost)
              : posts.map(renderStandardPost)
          ) : (
            <div className="py-3 text-center text-muted-foreground text-sm">
              No {type.toLowerCase()}s to show
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 