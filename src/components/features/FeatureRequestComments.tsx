"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageSquare } from "lucide-react";
import { TextImproverButton } from "@/components/ui/text-improver-button";

type User = {
  id: string;
  name: string | null;
  image: string | null;
};

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  author: User;
}

interface FeatureRequestCommentsProps {
  featureRequestId: string;
  comments: Comment[];
  currentUserId: string | undefined;
}

export default function FeatureRequestComments({
  featureRequestId,
  comments: initialComments,
  currentUserId,
}: FeatureRequestCommentsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleImprovedText = (improvedText: string) => {
    setNewComment(improvedText);
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentUserId) {
      toast({
        title: "Authentication required",
        description: "You must be logged in to comment",
        variant: "destructive",
      });
      return;
    }
    
    if (!newComment.trim()) {
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const response = await fetch(`/api/features/${featureRequestId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: newComment }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to add comment");
      }
      
      const comment = await response.json();
      setComments((prev) => [comment, ...prev]);
      setNewComment("");
      
      toast({
        title: "Comment added",
        description: "Your comment has been added successfully",
      });
      
      router.refresh();
    } catch (error) {
      console.error("Comment submission error:", error);
      toast({
        title: "Error",
        description: "Failed to add comment",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-primary" />
        <h3 className="text-xl font-semibold">Comments ({comments.length})</h3>
      </div>
      
      {currentUserId && (
        <form onSubmit={handleSubmitComment} className="space-y-3">
          <div className="relative">
            <Textarea
              placeholder="Add your comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="min-h-[100px] resize-none bg-background border-border/60 focus:border-primary focus:ring-primary transition-all pr-10"
              disabled={isSubmitting}
            />
            <div className="absolute right-2 bottom-2">
              <TextImproverButton 
                text={newComment}
                onImprovedText={handleImprovedText}
                disabled={isSubmitting}
                size="sm"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button 
              type="submit" 
              disabled={isSubmitting || !newComment.trim()}
              className="bg-primary hover:bg-primary/90 transition-colors"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Add Comment"
              )}
            </Button>
          </div>
        </form>
      )}
      
      {comments.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground bg-secondary/20 rounded-lg">
          <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
          <p>No comments yet. Be the first to comment!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="bg-card/95 p-4 rounded-lg border border-border/40 hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-center gap-2 mb-3">
                <Avatar className="h-7 w-7 border border-border/40">
                  <AvatarImage src={comment.author.image || undefined} alt={comment.author.name || "User"} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {comment.author.name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col xs:flex-row xs:items-center gap-0 xs:gap-2">
                  <span className="font-medium text-sm">{comment.author.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                  </span>
                </div>
              </div>
              <div className="pl-9">
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{comment.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 