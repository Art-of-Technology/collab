"use client";

import { Button } from "@/components/ui/button";
import { BellIcon, BellSlashIcon } from "@heroicons/react/24/outline";
import { BellIcon as BellSolidIcon } from "@heroicons/react/24/solid";
import { useIsPostFollowed, useFollowPost, useUnfollowPost } from "@/hooks/queries/usePostFollow";
import { useState } from "react";

interface PostFollowButtonProps {
  postId: string;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "ghost" | "outline";
  showText?: boolean;
  initialIsFollowing?: boolean;
}

export default function PostFollowButton({
  postId,
  size = "sm",
  variant = "ghost",
  showText = true,
  initialIsFollowing = false
}: PostFollowButtonProps) {
  const followMutation = useFollowPost();
  const unfollowMutation = useUnfollowPost();

  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const isProcessing = followMutation.isPending || unfollowMutation.isPending;

  const handleToggleFollow = async () => {
    if (isProcessing) return;

    try {
      if (isFollowing) {
        await unfollowMutation.mutateAsync(postId);
        setIsFollowing(false);
      } else {
        await followMutation.mutateAsync(postId);
        setIsFollowing(true);
      }
    } catch (error) {
      console.error("Error toggling post follow:", error);
    }
  };

  return (
    <Button
      onClick={handleToggleFollow}
      variant={variant}
      size={size}
      disabled={isProcessing}
      className="flex items-center gap-1 hover-effect min-w-0 px-1 sm:px-2 py-2 h-8 sm:h-9"
    >
      {isFollowing ? (
        <>
          <BellSlashIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-orange-500 flex-shrink-0" />
          {showText && <span className="hidden lg:inline text-xs sm:text-sm">Unfollow</span>}
        </>
      ) : (
        <>
          <BellIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
          {showText && <span className="hidden lg:inline text-xs sm:text-sm">Follow</span>}
        </>
      )}
    </Button>
  );
}