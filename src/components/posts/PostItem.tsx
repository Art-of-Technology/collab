"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

// Import our new components
import PostHeader from "./PostHeader";
import PostContent from "./PostContent";
import PostActions from "./PostActions";
import LikesSummary from "./LikesSummary";
import CommentsList from "./CommentsList";
import PostDialogs from "./PostDialogs";
import LikesModal from "./LikesModal";

// Import shared types
import { PrismaPost, ReactionWithAuthor, BadgeVariant, PriorityDisplay } from "./types";

interface PostItemProps {
  post: PrismaPost;
  isExpanded: boolean;
  toggleExpand: (postId: string) => void;
  currentUserId: string;
}

// Helper to get badge variant based on post type
const getTypeVariant = (type: string): BadgeVariant => {
  switch (type) {
    case "BLOCKER":
      return "destructive";
    case "RESOLVED":
      return "default"; // Green styling for resolved
    case "IDEA":
      return "secondary";
    case "QUESTION":
      return "default";
    default:
      return "outline";
  }
};

// Helper to get priority text and color
const getPriorityDisplay = (priority: string): PriorityDisplay => {
  switch (priority) {
    case "critical":
      return { text: "Critical", variant: "destructive" };
    case "high":
      return { text: "High", variant: "default" };
    default:
      return { text: "Normal", variant: "outline" };
  }
};

export default function PostItem({
  post,
  isExpanded,
  toggleExpand,
  currentUserId,
}: PostItemProps) {
  // Basic state
  const [likesCount, setLikesCount] = useState(
    (post.reactions || []).filter((reaction: { type: string; }) => reaction.type === "LIKE").length
  );
  const [likesWithAuthor, setLikesWithAuthor] = useState<ReactionWithAuthor[]>([]);
  
  // Dialog states
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isLikesDialogOpen, setIsLikesDialogOpen] = useState(false);
  
  // Computed values
  const commentsCount = (post.comments || []).length;
  const isAuthor = post.authorId === currentUserId;
  const timeAgo = formatDistanceToNow(new Date(post.createdAt), { addSuffix: true });
  
  // Get initial liked and bookmarked state
  const initialLiked = (post.reactions || []).some(
    (reaction: { authorId: string; type: string; }) => reaction.authorId === currentUserId && reaction.type === "LIKE"
  );
  const initialBookmarked = (post.reactions || []).some(
    (reaction: { authorId: string; type: string; }) => reaction.authorId === currentUserId && reaction.type === "BOOKMARK"
  );

  // Initial edit form data
  const initialEditData = {
    message: post.message,
    type: post.type,
    priority: post.priority,
    tags: (post.tags || []).map((tag: { name: any; }) => tag.name).join(", ")
  };

  // Get badge variants
  const typeVariant = getTypeVariant(post.type);
  const priorityDisplay = getPriorityDisplay(post.priority);

  // Handle like change
  const handleLikeChange = (newLikedState: boolean) => {
    setLikesCount((prev: number) => newLikedState ? prev + 1 : prev - 1);
    
    // If already loaded likes data, refresh it
    if (likesWithAuthor.length > 0 || isLikesDialogOpen) {
      getLikes();
    }
  };

  // Get like reactions with author details
  const getLikes = async () => {
    try {
      const response = await fetch(`/api/posts/${post.id}/reactions`);
      
      if (!response.ok) {
        throw new Error("Failed to fetch likes");
      }
      
      const data = await response.json();
      // Filter only LIKE reactions and include author details
      const likes = data.reactions.filter((reaction: ReactionWithAuthor) => 
        reaction.type === "LIKE"
      );
      
      setLikesWithAuthor(likes);
    } catch (error) {
      console.error("Failed to get likes:", error);
    }
  };

  const handleOpenLikesDialog = async () => {
    await getLikes();
    setIsLikesDialogOpen(true);
  };

  return (
    <Card className="mb-4 transition-shadow hover:shadow-lg border-border/50">
      <CardHeader className="pb-2">
        <PostHeader 
          authorId={post.author.id}
          authorName={post.author.name}
          authorImage={post.author.image}
          timeAgo={timeAgo}
          postType={post.type}
          postPriority={post.priority}
          isAuthor={isAuthor}
          typeVariant={typeVariant}
          priorityDisplay={priorityDisplay}
          onEditClick={() => setIsEditDialogOpen(true)}
          onDeleteClick={() => setIsDeleteDialogOpen(true)}
          author={post.author}
          postId={post.id}
          workspaceOwnerId={post.workspace?.ownerId}
        />
      </CardHeader>
      
      <CardContent className="pt-2">
        <PostContent 
          message={post.message}
          html={post.html}
          tags={post.tags || []}
          likesCount={likesCount}
          commentsCount={commentsCount}
          onToggleExpand={() => toggleExpand(post.id)}
        />
      </CardContent>

      <Separator className="bg-border/50" />
      
      <CardFooter className="pt-2 pb-2 px-6 bg-card/50">
        <PostActions 
          postId={post.id}
          initialLiked={initialLiked}
          initialBookmarked={initialBookmarked}
          onLikeChange={handleLikeChange}
          onToggleExpand={() => toggleExpand(post.id)}
        />
      </CardFooter>

      {isExpanded && (
        <>
          <Separator />
          <CardContent className="pt-3">
            <LikesSummary 
              likesCount={likesCount}
              likesWithAuthor={likesWithAuthor}
              onShowAllLikes={handleOpenLikesDialog}
              postId={post.id}
            />
            
            <CommentsList
              postId={post.id}
              comments={post.comments}
              currentUserId={currentUserId}
            />
          </CardContent>
        </>
      )}

      {/* Dialogs */}
      <PostDialogs 
        postId={post.id}
        isDeleteDialogOpen={isDeleteDialogOpen}
        setIsDeleteDialogOpen={setIsDeleteDialogOpen}
        isEditDialogOpen={isEditDialogOpen}
        setIsEditDialogOpen={setIsEditDialogOpen}
        initialEditData={initialEditData}
      />
      
      <LikesModal 
        postId={post.id}
        isOpen={isLikesDialogOpen}
        onOpenChange={setIsLikesDialogOpen}
        initialLikes={likesWithAuthor}
      />
    </Card>
  );
} 