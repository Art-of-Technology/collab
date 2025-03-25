"use client";

import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  ChatBubbleLeftIcon,
  BookmarkIcon,
  HeartIcon,
  ShareIcon,
} from "@heroicons/react/24/outline";
import {
  BookmarkIcon as BookmarkSolidIcon,
  HeartIcon as HeartSolidIcon,
} from "@heroicons/react/24/solid";

interface PostActionsProps {
  postId: string;
  initialLiked: boolean;
  initialBookmarked: boolean;
  onLikeChange: (newLikedState: boolean) => void;
  onToggleExpand: () => void;
}

export default function PostActions({
  postId,
  initialLiked,
  initialBookmarked,
  onLikeChange,
  onToggleExpand,
}: PostActionsProps) {
  const { toast } = useToast();
  const [liked, setLiked] = useState(initialLiked);
  const [bookmarked, setBookmarked] = useState(initialBookmarked);

  const handleLike = async () => {
    try {
      const response = await fetch(`/api/posts/${postId}/reactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "LIKE",
        }),
      });

      if (!response.ok) throw new Error();

      // Update local state
      const newLikedState = !liked;
      setLiked(newLikedState);
      
      // Notify parent component
      onLikeChange(newLikedState);

      toast({
        description: liked ? "Removed like" : "Added like"
      });
    } catch (error) {
      console.error("Failed to like post:", error);
      toast({
        title: "Error",
        description: "Failed to like post",
        variant: "destructive"
      });
    }
  };

  const handleBookmark = async () => {
    try {
      const response = await fetch(`/api/posts/${postId}/reactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "BOOKMARK",
        }),
      });

      if (!response.ok) throw new Error();

      // Update local state
      const newBookmarkedState = !bookmarked;
      setBookmarked(newBookmarkedState);

      toast({
        description: bookmarked ? "Removed bookmark" : "Added bookmark"
      });
    } catch (error) {
      console.error("Failed to bookmark post:", error);
      toast({
        title: "Error",
        description: "Failed to bookmark post",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="w-full flex justify-between">
      <Button
        onClick={handleLike}
        variant="ghost"
        size="sm"
        className="flex items-center gap-1 hover-effect"
      >
        {liked ? (
          <HeartSolidIcon className="h-4 w-4 text-rose-500" />
        ) : (
          <HeartIcon className="h-4 w-4" />
        )}
        <span>Like</span>
      </Button>
      <Button
        onClick={onToggleExpand}
        variant="ghost"
        size="sm"
        className="flex items-center gap-1 hover-effect"
      >
        <ChatBubbleLeftIcon className="h-4 w-4" />
        <span>Comment</span>
      </Button>
      <Button
        onClick={handleBookmark}
        variant="ghost"
        size="sm"
        className="flex items-center gap-1 hover-effect"
      >
        {bookmarked ? (
          <BookmarkSolidIcon className="h-4 w-4 text-indigo-500" />
        ) : (
          <BookmarkIcon className="h-4 w-4" />
        )}
        <span>Bookmark</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="flex items-center gap-1 hover-effect"
      >
        <ShareIcon className="h-4 w-4" />
        <span>Share</span>
      </Button>
    </div>
  );
} 