"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { useAddFeatureComment } from "@/hooks/queries/useFeature";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  author: {
    id: string;
    name: string | null;
    image: string | null;
  };
}

interface FeatureRequestCommentsProps {
  featureRequestId: string;
  comments: Comment[];
  currentUserId: string;
}

export default function FeatureRequestComments({
  featureRequestId,
  comments,
  currentUserId,
}: FeatureRequestCommentsProps) {
  const { toast } = useToast();
  const [commentText, setCommentText] = useState("");
  
  const addComment = useAddFeatureComment();

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!commentText.trim()) {
      toast({
        title: "Comment required",
        description: "Please write a comment before submitting",
        variant: "destructive",
      });
      return;
    }

    try {
      addComment.mutate(
        { 
          featureRequestId, 
          content: commentText 
        },
        {
          onSuccess: () => {
            setCommentText("");
            toast({
              title: "Comment added",
              description: "Your comment has been added successfully",
            });
          },
          onError: () => {
            toast({
              title: "Error",
              description: "Failed to add your comment",
              variant: "destructive",
            });
          }
        }
      );
    } catch (error) {
      console.error("Error adding comment:", error);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">
        Comments ({comments.length})
      </h2>

      {/* Comment form */}
      <form onSubmit={handleSubmitComment} className="space-y-4">
        <Textarea
          placeholder="Add a comment..."
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          className="min-h-[100px] resize-none"
        />
        <div className="flex justify-end">
          <Button 
            type="submit" 
            disabled={addComment.isPending || !commentText.trim()}
            className="min-w-[120px]"
          >
            {addComment.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Posting...
              </>
            ) : (
              "Post Comment"
            )}
          </Button>
        </div>
      </form>

      {/* Comments list */}
      <div className="space-y-4 mt-8">
        {comments.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No comments yet. Be the first to add a comment!
          </p>
        ) : (
          comments.map((comment) => (
            <div
              key={comment.id}
              className="p-4 border border-border/50 rounded-lg bg-card/80"
            >
              <div className="flex items-center gap-3 mb-2">
                <Avatar className="h-8 w-8 border border-border/50">
                  <AvatarImage
                    src={comment.author.image || undefined}
                    alt={comment.author.name || ""}
                  />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {comment.author.name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium text-sm">
                    {comment.author.id === currentUserId ? "You" : comment.author.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(comment.createdAt), {
                      addSuffix: true,
                    })}
                  </div>
                </div>
              </div>
              <div className="text-sm whitespace-pre-wrap">{comment.content}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
} 