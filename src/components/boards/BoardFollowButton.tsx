"use client";

import React from 'react';
import { Eye, EyeOff, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useBoardFollowStatus, useFollowBoard, useUnfollowBoard } from '@/hooks/queries/useBoardFollow';
import { toast } from '@/hooks/use-toast';

interface BoardFollowButtonProps {
  boardId: string;
  className?: string;
  variant?: 'default' | 'compact' | 'icon-only';
  showFollowerCount?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function BoardFollowButton({
  boardId,
  className,
}: BoardFollowButtonProps) {
  const { data: followStatus, isLoading } = useBoardFollowStatus(boardId);
  const followMutation = useFollowBoard(boardId);
  const unfollowMutation = useUnfollowBoard(boardId);

  const handleToggleFollow = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      if (followStatus?.isFollowing) {
        await unfollowMutation.mutateAsync();
        toast({
          title: "Unfollowed board",
          description: "You will no longer receive notifications for task status changes on this board.",
        });
      } else {
        await followMutation.mutateAsync();
        toast({
          title: "Following board",
          description: "You will now receive notifications when task statuses change on this board.",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: followStatus?.isFollowing
          ? "Failed to unfollow board"
          : "Failed to follow board",
        variant: "destructive",
      });
    }
  };

  const isPending = followMutation.isPending || unfollowMutation.isPending;
  const isFollowing = followStatus?.isFollowing;

  // Loading state
  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Button variant="outline" size="sm" disabled>
          <Eye className="h-4 w-4" /> Loading...
        </Button>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Button
        variant={isFollowing ? "default" : "outline"}
        size="sm"
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
    </div>
  );
}