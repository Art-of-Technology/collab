"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  ChatBubbleLeftIcon,
  BookmarkIcon,
  HeartIcon,
  ShareIcon,
  ArrowUturnLeftIcon,
  PencilSquareIcon,
  TrashIcon,
  EllipsisHorizontalIcon
} from "@heroicons/react/24/outline";
import {
  BookmarkIcon as BookmarkSolidIcon,
  HeartIcon as HeartSolidIcon,
} from "@heroicons/react/24/solid";
import type { Post, User, Tag, Comment, Reaction } from "@prisma/client";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

// Type that matches Prisma&apos;s response structure
export type PrismaPost = Post & {
  author: User;
  tags: Tag[];
  comments: (Comment & { author: User })[];
  reactions: Reaction[];
};

interface PostItemProps {
  post: PrismaPost;
  isExpanded: boolean;
  toggleExpand: (postId: string) => void;
  currentUserId: string;
}

// Helper to get badge variant based on post type
const getTypeVariant = (type: string): "destructive" | "secondary" | "default" | "outline" => {
  switch (type) {
    case "BLOCKER":
      return "destructive";
    case "IDEA":
      return "secondary";
    case "QUESTION":
      return "default";
    default:
      return "outline";
  }
};

// Helper to get priority text and color
const getPriorityDisplay = (priority: string): { text: string; variant: "destructive" | "default" | "outline" } => {
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
  const router = useRouter();
  const { toast } = useToast();
  const [liked, setLiked] = useState(
    post.reactions.some(
      (reaction) => reaction.authorId === currentUserId && reaction.type === "LIKE"
    )
  );
  const [bookmarked, setBookmarked] = useState(
    post.reactions.some(
      (reaction) => reaction.authorId === currentUserId && reaction.type === "BOOKMARK"
    )
  );
  const [commentText, setCommentText] = useState("");
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [likesCount, setLikesCount] = useState(
    post.reactions.filter((reaction) => reaction.type === "LIKE").length
  );
  
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editFormData, setEditFormData] = useState({
    message: post.message,
    type: post.type,
    priority: post.priority,
    tags: post.tags.map(tag => tag.name).join(", ")
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const commentsCount = post.comments.length;
  const isAuthor = post.authorId === currentUserId;
  const timeAgo = formatDistanceToNow(new Date(post.createdAt), { addSuffix: true });
  
  const handleLike = async () => {
    try {
      const response = await fetch(`/api/posts/${post.id}/reactions`, {
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
      setLikesCount(prev => newLikedState ? prev + 1 : prev - 1);
      
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
      const response = await fetch(`/api/posts/${post.id}/reactions`, {
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

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!commentText.trim()) return;
    
    setIsAddingComment(true);
    
    try {
      const response = await fetch(`/api/posts/${post.id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: commentText,
        }),
      });

      if (!response.ok) throw new Error();
      
      setCommentText("");
      toast({
        description: "Comment added"
      });
      
      // Refresh the page to show the new comment
      router.refresh();
    } catch (error) {
      console.error("Failed to add comment:", error);
      toast({
        title: "Error",
        description: "Failed to add comment",
        variant: "destructive"
      });
    } finally {
      setIsAddingComment(false);
    }
  };
  
  const handleEditChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setEditFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleEditSelectChange = (name: string, value: string) => {
    setEditFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };
  
  const handleDeletePost = async () => {
    if (isDeleting) return;
    
    setIsDeleting(true);
    
    try {
      const response = await fetch(`/api/posts/${post.id}`, {
        method: "DELETE"
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || "Failed to delete post");
      }
      
      setIsDeleteDialogOpen(false);
      
      toast({
        description: "Post deleted successfully"
      });
      
      // Refresh the page to remove the deleted post
      router.refresh();
      
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete post",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
    }
  };
  
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isSubmitting) return;
    
    if (!editFormData.message.trim()) {
      toast({
        title: "Error",
        description: "Message is required",
        variant: "destructive"
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Process tags into an array
      const tagsArray = editFormData.tags
        ? editFormData.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
        : [];
      
      const response = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: editFormData.message,
          type: editFormData.type,
          tags: tagsArray,
          priority: editFormData.priority,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || "Failed to update post");
      }
      
      setIsEditDialogOpen(false);
      
      toast({
        description: "Post updated successfully"
      });
      
      // Refresh the page to show the updated post
      router.refresh();
      
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update post",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const typeVariant = getTypeVariant(post.type);
  const priorityDisplay = getPriorityDisplay(post.priority);

  return (
    <Card className="mb-4 overflow-hidden transition-shadow hover:shadow-lg border-border/50">
      <CardHeader className="flex flex-row items-start space-y-0 pb-2 bg-card/50">
        <Avatar className="h-10 w-10 mr-3 border border-primary/10">
          <AvatarImage src={post.author.image || undefined} alt={post.author.name || "User"} />
          <AvatarFallback className="bg-primary/10 text-primary">
            {post.author.name?.charAt(0).toUpperCase() || "U"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex justify-between items-center mb-1">
            <div>
              <Link 
                href={`/profile/${post.author.id}`}
                className="font-semibold hover:underline hover:text-primary transition-colors"
              >
                {post.author.name}
              </Link>
              <span className="text-muted-foreground text-xs ml-2">
                {timeAgo}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <Badge variant={typeVariant}>
                  {post.type.charAt(0) + post.type.slice(1).toLowerCase()}
                </Badge>
                {post.priority !== "normal" && (
                  <Badge variant={priorityDisplay.variant}>
                    {priorityDisplay.text}
                  </Badge>
                )}
              </div>
              
              {isAuthor && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 hover-effect">
                      <EllipsisHorizontalIcon className="h-5 w-5" />
                      <span className="sr-only">More options</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="shadow-lg">
                    <DropdownMenuItem onClick={() => setIsEditDialogOpen(true)} className="hover-effect">
                      <PencilSquareIcon className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setIsDeleteDialogOpen(true)}
                      className="text-destructive focus:text-destructive hover-effect"
                    >
                      <TrashIcon className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <p className="whitespace-pre-wrap">{post.message}</p>
        
        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {post.tags.map((tag) => (
              <Link 
                key={tag.id} 
                href={`/timeline?tag=${encodeURIComponent(tag.name)}`}
                className="no-underline"
              >
                <Badge key={tag.id} variant="secondary" className="text-xs hover:bg-secondary/80 transition-colors">
                  #{tag.name}
                </Badge>
              </Link>
            ))}
          </div>
        )}
        
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <div className="flex gap-4">
            <span className="flex items-center">
              <HeartIcon className="h-4 w-4 mr-1" />
              {likesCount} {likesCount === 1 ? "like" : "likes"}
            </span>
            <span className="flex items-center">
              <ChatBubbleLeftIcon className="h-4 w-4 mr-1" />
              {commentsCount} {commentsCount === 1 ? "comment" : "comments"}
            </span>
          </div>
        </div>
      </CardContent>
      
      <Separator className="bg-border/50" />
      
      <CardFooter className="pt-2 pb-2 px-6 bg-card/50">
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
            onClick={() => toggleExpand(post.id)} 
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
      </CardFooter>
      
      {isExpanded && (
        <>
          <Separator />
          <CardContent className="pt-3">
            {post.comments.length > 0 && (
              <div className="space-y-3 mb-4">
                {post.comments.map((comment) => (
                  <div key={comment.id} className="flex gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        {comment.author.name?.charAt(0).toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="bg-muted rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <Link
                            href={`/profile/${comment.author.id}`}
                            className="font-semibold text-sm hover:underline"
                          >
                            {comment.author.name}
                          </Link>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm">{comment.message}</p>
                      </div>
                      <div className="flex gap-2 ml-2 mt-1 text-xs">
                        <button className="text-muted-foreground hover:text-primary">Like</button>
                        <button className="text-muted-foreground hover:text-primary">Reply</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <form onSubmit={handleAddComment} className="flex gap-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback>
                  {currentUserId.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <Textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Write a comment..."
                  className="min-h-[60px] resize-none mb-2"
                />
                <div className="flex justify-between">
                  <div></div>
                  <Button 
                    type="submit" 
                    size="sm"
                    disabled={!commentText.trim() || isAddingComment}
                  >
                    {isAddingComment ? "Posting..." : "Post Comment"}
                    {!isAddingComment && <ArrowUturnLeftIcon className="ml-1 h-3 w-3" />}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </>
      )}
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="shadow-xl border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle>Delete Post</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Are you sure you want to delete this post? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeleting}
              className="hover-effect"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeletePost}
              disabled={isDeleting}
              className="hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Edit Post Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px] shadow-xl border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle>Edit Post</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Make changes to your post. Click save when you&apos;re done.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  name="message"
                  value={editFormData.message}
                  onChange={handleEditChange}
                  placeholder="What&apos;s happening in your development world?"
                  rows={4}
                  className="resize-none bg-background border-border/60 focus:border-primary focus:ring-primary"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">Post Type</Label>
                  <Select
                    name="type"
                    value={editFormData.type}
                    onValueChange={(value) => handleEditSelectChange("type", value)}
                  >
                    <SelectTrigger className="bg-background border-border/60">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UPDATE">Update</SelectItem>
                      <SelectItem value="BLOCKER">Blocker</SelectItem>
                      <SelectItem value="IDEA">Idea</SelectItem>
                      <SelectItem value="QUESTION">Question</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select
                    name="priority"
                    value={editFormData.priority}
                    onValueChange={(value) => handleEditSelectChange("priority", value)}
                  >
                    <SelectTrigger className="bg-background border-border/60">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="tags">Tags (comma separated)</Label>
                <Input
                  id="tags"
                  name="tags"
                  value={editFormData.tags}
                  onChange={handleEditChange}
                  placeholder="e.g. react, bug, feature"
                  className="bg-background border-border/60 focus:border-primary focus:ring-primary"
                />
              </div>
            </div>
            <DialogFooter>
              <Button 
                type="button"
                variant="outline" 
                onClick={() => setIsEditDialogOpen(false)}
                disabled={isSubmitting}
                className="hover-effect"
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={isSubmitting || !editFormData.message.trim()}
                className="bg-primary hover:bg-primary/90"
              >
                {isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
} 