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
import { useWorkspace } from "@/context/WorkspaceContext";
import PostFollowButton from "./PostFollowButton";

interface PostActionsProps {
  postId: string;
  initialLiked: boolean;
  initialBookmarked: boolean;
  isFollowing: boolean;
  onLikeChange: (newLikedState: boolean) => void;
  onToggleExpand: () => void;
}

export default function PostActions({
  postId,
  initialLiked,
  initialBookmarked,
  isFollowing,
  onLikeChange,
  onToggleExpand,
}: PostActionsProps) {
  const { toast } = useToast();
  const { currentWorkspace } = useWorkspace();
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

  const postUrl = typeof window !== 'undefined' && currentWorkspace
    ? `${window.location.origin}/${currentWorkspace.id}/posts/${postId}`
    : `#`;

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
      <div className="w-full flex justify-center items-center gap-2">
        {/* Like Button */}
        <Button
          onClick={handleLike}
          variant="ghost"
          size="sm"
          className="flex items-center gap-1 hover-effect min-w-0 flex-1 justify-center lg:justify-start lg:flex-initial px-1 sm:px-2 py-2 h-8 sm:h-9"
          disabled={addReactionMutation.isPending || removeReactionMutation.isPending}
        >
          {liked ? (
            <HeartSolidIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-rose-500 flex-shrink-0" />
          ) : (
            <HeartIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
          )}
          <span className="hidden lg:inline text-xs sm:text-sm">Like</span>
        </Button>

        {/* Comment Button */}
        <Button
          onClick={onToggleExpand}
          variant="ghost"
          size="sm"
          className="flex items-center gap-1 hover-effect min-w-0 flex-1 justify-center lg:justify-start lg:flex-initial px-1 sm:px-2 py-2 h-8 sm:h-9"
        >
          <ChatBubbleLeftIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
          <span className="hidden lg:inline text-xs sm:text-sm">Comment</span>
        </Button>

        {/* Bookmark Button */}
        <Button
          onClick={handleBookmark}
          variant="ghost"
          size="sm"
          className="flex items-center gap-1 hover-effect min-w-0 flex-1 justify-center lg:justify-start lg:flex-initial px-1 sm:px-2 py-2 h-8 sm:h-9"
          disabled={addBookmarkMutation.isPending || removeBookmarkMutation.isPending}
        >
          {isBookmarked ? (
            <BookmarkSolidIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-indigo-500 flex-shrink-0" />
          ) : (
            <BookmarkIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
          )}
          <span className="hidden lg:inline text-xs sm:text-sm">Bookmark</span>
        </Button>

        {/* Follow Button */}
        <div className="flex-shrink-0">
          <PostFollowButton 
            postId={postId} 
            initialIsFollowing={isFollowing}
            size="sm"
            variant="ghost"
          />
        </div>

        {/* Share Button*/}
        <Button
          onClick={handleShare}
          variant="ghost"
          size="sm"
          className="flex items-center gap-1 hover-effect min-w-0 flex-1 justify-center lg:justify-start lg:flex-initial px-1 sm:px-2 py-2 h-8 sm:h-9"
        >
          <ShareIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
          <span className="hidden lg:inline text-xs sm:text-sm">Share</span>
        </Button>
      </div>

      <Dialog open={shareModalOpen} onOpenChange={setShareModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Share Post</DialogTitle>
            <DialogDescription className="text-sm">
              Copy the link below to share this post with others
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center space-x-2 mt-4">
            <div className="grid flex-1 gap-2">
              <Input
                value={postUrl}
                readOnly
                className="bg-background/50 text-xs sm:text-sm"
              />
            </div>
            <Button
              type="button"
              size="sm"
              className="px-2 sm:px-3 transition-all duration-300 h-8 sm:h-9"
              onClick={copyToClipboard}
            >
              {copied ? (
                <CheckIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />
              ) : (
                <ClipboardDocumentIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              )}
              <span className="hidden sm:inline ml-1 text-xs">Copy</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
} 