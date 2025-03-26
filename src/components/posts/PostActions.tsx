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
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const postUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/posts/${postId}` 
    : `/posts/${postId}`;

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