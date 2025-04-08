"use client";

import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  ChatBubbleLeftIcon,
  BookmarkIcon,
  HeartIcon,
  ShareIcon,
  CheckIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";
import {
  BookmarkIcon as BookmarkSolidIcon,
  HeartIcon as HeartSolidIcon,
} from "@heroicons/react/24/solid";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAddReaction, useRemoveReaction } from "@/hooks/queries/useReaction";
import { useIsPostBookmarked, useAddBookmark, useRemoveBookmark } from "@/hooks/queries/useBookmark";

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
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // TanStack Query hooks for bookmarks
  const { data: isBookmarked = initialBookmarked } = useIsPostBookmarked(postId);
  const addBookmarkMutation = useAddBookmark();
  const removeBookmarkMutation = useRemoveBookmark();
  
  // TanStack Query hooks for reactions (likes)
  const addReactionMutation = useAddReaction();
  const removeReactionMutation = useRemoveReaction();

  const postUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/posts/${postId}` 
    : `/posts/${postId}`;

  const handleLike = async () => {
    try {
      if (liked) {
        await removeReactionMutation.mutateAsync({
          type: 'LIKE',
          postId
        });
      } else {
        await addReactionMutation.mutateAsync({
          type: 'LIKE',
          postId
        });
      }

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
      if (isBookmarked) {
        await removeBookmarkMutation.mutateAsync(postId);
      } else {
        await addBookmarkMutation.mutateAsync(postId);
      }

      toast({
        description: isBookmarked ? "Removed bookmark" : "Added bookmark"
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

  const handleShare = () => {
    setShareModalOpen(true);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(postUrl);
      setCopied(true);
      toast({
        description: "Link copied to clipboard"
      });
      
      // Reset copied state after 2 seconds
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error("Failed to copy link:", error);
      toast({
        title: "Error",
        description: "Failed to copy link",
        variant: "destructive"
      });
    }
  };

  return (
    <>
      <div className="w-full flex justify-between">
        <Button
          onClick={handleLike}
          variant="ghost"
          size="sm"
          className="flex items-center gap-1 hover-effect"
          disabled={addReactionMutation.isPending || removeReactionMutation.isPending}
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
          disabled={addBookmarkMutation.isPending || removeBookmarkMutation.isPending}
        >
          {isBookmarked ? (
            <BookmarkSolidIcon className="h-4 w-4 text-indigo-500" />
          ) : (
            <BookmarkIcon className="h-4 w-4" />
          )}
          <span>Bookmark</span>
        </Button>
        <Button
          onClick={handleShare}
          variant="ghost"
          size="sm"
          className="flex items-center gap-1 hover-effect"
        >
          <ShareIcon className="h-4 w-4" />
          <span>Share</span>
        </Button>
      </div>
      
      <Dialog open={shareModalOpen} onOpenChange={setShareModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share Post</DialogTitle>
            <DialogDescription>
              Copy the link below to share this post with others
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center space-x-2 mt-4">
            <div className="grid flex-1 gap-2">
              <Input
                value={postUrl}
                readOnly
                className="bg-background/50"
              />
            </div>
            <Button
              type="button"
              size="sm"
              className="px-3 transition-all duration-300"
              onClick={copyToClipboard}
            >
              {copied ? (
                <CheckIcon className="h-4 w-4 text-white" />
              ) : (
                <ClipboardDocumentIcon className="h-4 w-4" />
              )}
              <span className="sr-only">Copy</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
} 