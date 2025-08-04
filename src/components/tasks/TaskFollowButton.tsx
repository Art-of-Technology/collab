"use client";

import React from 'react';
import { Eye, EyeOff, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTaskFollowStatus, useFollowTask, useUnfollowTask } from '@/hooks/queries/useTaskFollow';
import { toast } from '@/hooks/use-toast';

interface TaskFollowButtonProps {
  taskId: string;
  boardId?: string;
  className?: string;
  variant?: 'default' | 'compact' | 'icon-only';
  showFollowerCount?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function TaskFollowButton({ 
  taskId, 
  boardId,
  className, 
  variant = 'default',
  showFollowerCount = true,
  size = 'sm'
}: TaskFollowButtonProps) {
  const { data: followStatus, isLoading } = useTaskFollowStatus(taskId, boardId);
  const followMutation = useFollowTask(taskId, boardId);
  const unfollowMutation = useUnfollowTask(taskId, boardId);

  const handleToggleFollow = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      if (followStatus?.isFollowing) {
        await unfollowMutation.mutateAsync();
        toast({
          title: "Unfollowed task",
          description: "You will no longer receive notifications for this task.",
        });
      } else {
        await followMutation.mutateAsync();
        toast({
          title: "Following task",
          description: "You will now receive notifications when this task is updated.",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: followStatus?.isFollowing 
          ? "Failed to unfollow task" 
          : "Failed to follow task",
        variant: "destructive",
      });
    }
  };

  const isPending = followMutation.isPending || unfollowMutation.isPending;
  const isFollowing = followStatus?.isFollowing;
  
  // Loading state
  if (isLoading) {
    if (variant === 'icon-only') {
      return (
        <Button variant="ghost" size="sm" disabled className={className}>
          <Eye className="h-3 w-3 opacity-50" />
        </Button>
      );
    }
    
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Button variant="outline" size={size} disabled>
          <Eye className="h-4 w-4" />
          {variant !== 'compact' && "Loading..."}
        </Button>
      </div>
    );
  }

  // Icon-only variant for compact task cards
  if (variant === 'icon-only') {
    return (
      <Button
        variant={isFollowing ? "default" : "ghost"}
        size="sm"
        onClick={handleToggleFollow}
        disabled={isPending}
        className={`h-6 w-6 p-0 ${className}`}
        title={isFollowing ? "Unfollow task" : "Follow task"}
      >
        {isFollowing ? (
          <EyeOff className="h-3 w-3" />
        ) : (
          <Eye className="h-3 w-3" />
        )}
      </Button>
    );
  }

  // Compact variant for task cards
  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <Button
          variant={isFollowing ? "default" : "ghost"}
          size="sm"
          onClick={handleToggleFollow}
          disabled={isPending}
          className="h-6 px-2 text-xs"
        >
          {isFollowing ? (
            <EyeOff className="h-3 w-3 mr-1" />
          ) : (
            <Eye className="h-3 w-3 mr-1" />
          )}
          {isFollowing ? "Following" : "Follow"}
        </Button>
        
        {showFollowerCount && followStatus && followStatus.count > 0 && (
          <Badge variant="secondary" className="h-4 px-1 text-[10px]">
            {followStatus.count}
          </Badge>
        )}
      </div>
    );
  }

  // Default variant
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Button
        variant={isFollowing ? "default" : "outline"}
        size={size}
        onClick={handleToggleFollow}
        disabled={isPending}
      >
        {isFollowing ? (
          <>
            <EyeOff className="h-4 w-4 mr-1" />
            Unfollow
          </>
        ) : (
          <>
            <Eye className="h-4 w-4 mr-1" />
            Follow
          </>
        )}
      </Button>
      
      {showFollowerCount && followStatus && followStatus.count > 0 && (
        <Badge variant="secondary" className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {followStatus.count} follower{followStatus.count !== 1 ? 's' : ''}
        </Badge>
      )}
    </div>
  );
}