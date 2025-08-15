"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useIssueFollowStatus, useFollowIssue, useUnfollowIssue } from "@/hooks/queries/useIssueFollow";
import { Heart, HeartIcon, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface IssueFollowButtonProps {
  issueId: string;
  projectId?: string;
  viewId?: string;
  className?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'link' | 'destructive' | 'secondary';
  showFollowerCount?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function IssueFollowButton({ 
  issueId, 
  projectId,
  viewId,
  className, 
  variant = 'default',
  showFollowerCount = true,
  size = 'sm'
}: IssueFollowButtonProps) {
  const { toast } = useToast();
  const { data: followStatus, isLoading } = useIssueFollowStatus(issueId, projectId, viewId);
  const followMutation = useFollowIssue(issueId, projectId, viewId);
  const unfollowMutation = useUnfollowIssue(issueId, projectId, viewId);

  const handleToggleFollow = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      if (followStatus?.isFollowing) {
        await unfollowMutation.mutateAsync();
        toast({
          title: "Unfollowed issue",
          description: "You will no longer receive notifications for this issue.",
        });
      } else {
        await followMutation.mutateAsync();
        toast({
          title: "Following issue",
          description: "You will now receive notifications when this issue is updated.",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: followStatus?.isFollowing 
          ? "Failed to unfollow issue" 
          : "Failed to follow issue",
        variant: "destructive",
      });
    }
  };

  const isPending = followMutation.isPending || unfollowMutation.isPending;
  const isFollowing = followStatus?.isFollowing;
  
  const getTooltipContent = () => {
    if (isPending) {
      return isFollowing ? "Unfollowing issue..." : "Following issue...";
    }
    if (isFollowing) {
      return "Unfollow this issue to stop receiving notifications";
    }
    return "Follow this issue to receive notifications when it's updated";
  };
  
  // Loading state
  if (isLoading) {
    return (
      <Button
        variant={variant}
        size={size}
        disabled
        className={cn("gap-2", className)}
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        {showFollowerCount && size !== 'sm' && <span>Loading...</span>}
      </Button>
    );
  }

  // Error state - show basic button
  if (!followStatus) {
    return (
      <Button
        variant={variant}
        size={size}
        disabled
        className={cn("gap-2", className)}
      >
        <Heart className="h-3 w-3" />
        {showFollowerCount && size !== 'sm' && <span>Follow</span>}
      </Button>
    );
  }

  const buttonSizeClass = size === 'lg' ? 'px-4 py-2' : size === 'md' ? 'px-3 py-1.5' : 'px-2 py-1';
  const iconSize = size === 'lg' ? 'h-4 w-4' : 'h-3 w-3';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={variant}
            size={size}
            onClick={handleToggleFollow}
            disabled={isPending}
            className={cn(
              "gap-2 transition-all duration-200",
              buttonSizeClass,
              isFollowing && variant === 'default' && "bg-red-500 hover:bg-red-600 text-white",
              isFollowing && variant === 'outline' && "border-red-500 text-red-500 hover:bg-red-50",
              className
            )}
          >
            {isPending ? (
              <Loader2 className={cn(iconSize, "animate-spin")} />
            ) : isFollowing ? (
              <Heart className={cn(iconSize, "fill-current")} />
            ) : (
              <Heart className={iconSize} />
            )}
            
            {size !== 'sm' && (
              <span className="text-xs font-medium">
                {isPending
                  ? (isFollowing ? "Unfollowing..." : "Following...")
                  : (isFollowing ? "Following" : "Follow")
                }
              </span>
            )}
            
            {showFollowerCount && followStatus.count > 0 && (
              <Badge 
                variant={isFollowing ? "secondary" : "outline"} 
                className={cn(
                  "text-xs px-1.5 py-0.5 min-w-[20px] h-5 flex items-center justify-center",
                  size === 'sm' && "text-[10px] px-1 py-0 min-w-[16px] h-4"
                )}
              >
                {followStatus.count}
              </Badge>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[200px]">
          <div className="space-y-1">
            <p className="text-xs">{getTooltipContent()}</p>
            {followStatus.count > 0 && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                <span>{followStatus.count} follower{followStatus.count !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

