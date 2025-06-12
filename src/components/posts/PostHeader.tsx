"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EllipsisHorizontalIcon, PencilSquareIcon, TrashIcon, CheckCircleIcon, ClockIcon } from "@heroicons/react/24/outline";
import { BadgeVariant } from "./types";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useResolvePost } from "@/hooks/queries/useResolvePost";
import { useCurrentUser } from "@/hooks/queries/useUser";
import { useState } from "react";
import PostHistoryModal from "./PostHistoryModal";

interface PostHeaderProps {
  authorId: string;
  authorName: string | null;
  authorImage: string | null;
  timeAgo: string;
  postType: string;
  postPriority: string;
  isAuthor: boolean;
  typeVariant: BadgeVariant;
  priorityDisplay: {
    text: string;
    variant: BadgeVariant;
  };
  onEditClick: () => void;
  onDeleteClick: () => void;
  author?: any; // Add the full author object
  postId: string; // Add postId for resolve functionality
  workspaceOwnerId?: string; // Add workspace owner ID
}

export default function PostHeader({
  authorId,
  authorName,
  authorImage,
  timeAgo,
  postType,
  postPriority,
  isAuthor,
  typeVariant,
  priorityDisplay,
  onEditClick,
  onDeleteClick,
  author,
  postId,
  workspaceOwnerId,
}: PostHeaderProps) {
  // Check if we have the full author object with custom avatar data
  const hasCustomAvatar = author && author.useCustomAvatar;
  const { currentWorkspace } = useWorkspace();
  const { data: currentUser } = useCurrentUser();
  const resolvePostMutation = useResolvePost();
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  
  // Check if user can resolve blocker posts
  const canResolve = postType === 'BLOCKER' && (
    isAuthor || 
    currentUser?.id === workspaceOwnerId || 
    currentUser?.role === 'admin'
  );
  
  const handleResolve = () => {
    resolvePostMutation.mutate(postId);
  };
  
  const handleOpenHistory = () => {
    setIsHistoryModalOpen(true);
  };
  
  return (
    <div className="flex flex-row items-start space-y-0 pb-2 bg-card/50">
      {hasCustomAvatar ? (
        <CustomAvatar user={author} size="md" className="mr-3 border border-primary/10" />
      ) : (
        <Avatar className="h-10 w-10 mr-3 border border-primary/10">
          <AvatarImage src={authorImage || undefined} alt={authorName || "User"} />
          <AvatarFallback className="bg-primary/10 text-primary">
            {authorName?.charAt(0).toUpperCase() || "U"}
          </AvatarFallback>
        </Avatar>
      )}
      <div className="flex-1">
        <div className="flex justify-between items-center mb-1">
          <div>
            <Link
              href={currentWorkspace ? `/${currentWorkspace.id}/profile/${authorId}` : `#`}
              className="font-semibold hover:underline hover:text-primary transition-colors"
            >
              {authorName}
            </Link>
            <span className="text-muted-foreground text-xs ml-2">
              {timeAgo}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <Badge variant={typeVariant}>
                {postType.charAt(0) + postType.slice(1).toLowerCase()}
              </Badge>
              {postPriority !== "normal" && (
                <Badge variant={priorityDisplay.variant}>
                  {priorityDisplay.text}
                </Badge>
              )}
            </div>
            
            {(isAuthor || canResolve) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover-effect">
                    <EllipsisHorizontalIcon className="h-5 w-5" />
                    <span className="sr-only">More options</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="shadow-lg">
                  {canResolve && (
                    <DropdownMenuItem 
                      onClick={handleResolve} 
                      className="text-green-600 focus:text-green-600 hover-effect"
                      disabled={resolvePostMutation.isPending}
                    >
                      <CheckCircleIcon className="h-4 w-4 mr-2" />
                      {resolvePostMutation.isPending ? 'Resolving...' : 'Mark as Resolved'}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={handleOpenHistory} className="hover-effect">
                    <ClockIcon className="h-4 w-4 mr-2" />
                    Post History
                  </DropdownMenuItem>
                  {isAuthor && (
                    <>
                      <DropdownMenuItem onClick={onEditClick} className="hover-effect">
                        <PencilSquareIcon className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={onDeleteClick}
                        className="text-destructive focus:text-destructive hover-effect"
                      >
                        <TrashIcon className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>
      
      {/* Post History Modal */}
      <PostHistoryModal
        postId={postId}
        isOpen={isHistoryModalOpen}
        onOpenChange={setIsHistoryModalOpen}
      />
    </div>
  );
} 