import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "next-auth/react";
import { MessageSquare, Send } from "lucide-react";

interface Comment {
  id: string;
  message: string;
  html?: string;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  parentId?: string;
  author: {
    id: string;
    name: string;
    image?: string;
  };
  children?: Comment[];
}

interface NoteCommentSectionProps {
  noteId: string;
}

export function NoteCommentSection({ noteId }: NoteCommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const { toast } = useToast();
  const { data: session } = useSession();

  const fetchComments = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/notes/${noteId}/comments`);
      
      if (response.ok) {
        const data = await response.json();
        setComments(data);
      } else {
        throw new Error("Failed to fetch comments");
      }
    } catch (error) {
      console.error("Error fetching comments:", error);
      toast({
        title: "Error",
        description: "Failed to load comments",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [noteId, toast]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleSubmitComment = async () => {
    if (!commentText.trim()) return;

    try {
      const response = await fetch(`/api/notes/${noteId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: commentText,
        }),
      });

      if (response.ok) {
        const newComment = await response.json();
        setComments([newComment, ...comments]);
        setCommentText("");
        toast({
          title: "Success",
          description: "Comment added successfully",
        });
      } else {
        throw new Error("Failed to add comment");
      }
    } catch (error) {
      console.error("Error adding comment:", error);
      toast({
        title: "Error",
        description: "Failed to add comment",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="mt-8 space-y-6">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5" />
        <h3 className="text-lg font-medium">Comments</h3>
      </div>

      {/* Comment form */}
      <div className="flex gap-4">
        <Avatar className="h-8 w-8">
          <AvatarImage src={session?.user?.image || undefined} />
          <AvatarFallback>{session?.user?.name?.charAt(0) || "U"}</AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-2">
          <Textarea
            placeholder="Add a comment..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            className="min-h-[100px]"
          />
          <div className="flex justify-end">
            <Button 
              onClick={handleSubmitComment} 
              disabled={!commentText.trim()}
              size="sm"
            >
              <Send className="h-4 w-4 mr-2" />
              Comment
            </Button>
          </div>
        </div>
      </div>

      {/* Comments list */}
      {isLoading ? (
        <div className="py-4 text-center text-muted-foreground">Loading comments...</div>
      ) : comments.length === 0 ? (
        <div className="py-4 text-center text-muted-foreground">No comments yet. Be the first to comment!</div>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <div key={comment.id} className="border rounded-lg p-4 bg-card/50">
              <div className="flex items-start gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={comment.author.image || undefined} />
                  <AvatarFallback>{comment.author.name?.charAt(0) || "U"}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-baseline justify-between">
                    <div className="font-medium">{comment.author.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                    </div>
                  </div>
                  <div className="mt-1 text-sm">
                    {comment.html ? (
                      <div dangerouslySetInnerHTML={{ __html: comment.html }} />
                    ) : (
                      <p>{comment.message}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Nested replies */}
              {comment.children && comment.children.length > 0 && (
                <div className="ml-10 mt-3 space-y-3">
                  {comment.children.map((reply) => (
                    <div key={reply.id} className="border rounded-lg p-3 bg-card/30">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={reply.author.image || undefined} />
                          <AvatarFallback>{reply.author.name?.charAt(0) || "U"}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-baseline justify-between">
                            <div className="font-medium text-sm">{reply.author.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(reply.createdAt), { addSuffix: true })}
                            </div>
                          </div>
                          <div className="mt-1 text-sm">
                            {reply.html ? (
                              <div dangerouslySetInnerHTML={{ __html: reply.html }} />
                            ) : (
                              <p>{reply.message}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
