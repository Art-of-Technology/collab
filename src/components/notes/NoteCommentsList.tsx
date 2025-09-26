"use client";

import { useMemo, useState, useEffect } from "react";
import { NoteComment, NoteCommentWithAuthor } from "@/components/notes/NoteComment";
import { NoteCommentForm } from "@/components/notes/NoteCommentForm";
import { useSession } from "next-auth/react";
import { useToast } from "@/hooks/use-toast";

// Helper function to ensure comments have the required structure
const ensureCommentStructure = (comments: any[]): NoteCommentWithAuthor[] => {
  return comments.map(comment => ({
    ...comment,
    author: comment.author || {
      id: "unknown",
      name: "Unknown User",
      image: null
    },
    reactions: comment.reactions || [],
    // Recursively fix nested replies structure if they exist
    children: comment.children ? ensureCommentStructure(comment.children) : undefined
  }));
};

// Helper function to organize comments into a tree structure
const organizeCommentsIntoTree = (comments: NoteCommentWithAuthor[]): NoteCommentWithAuthor[] => {
  // Just use the comments directly from the API for now
  // This is a temporary solution to debug the UI rendering
  return comments.filter(comment => !comment.parentId);
};

interface NoteCommentsListProps {
  noteId: string;
  initialComments?: NoteCommentWithAuthor[];
}

export function NoteCommentsList({ 
  noteId, 
  initialComments = []
}: NoteCommentsListProps) {
  const { data: session } = useSession();
  const [comments, setComments] = useState<NoteCommentWithAuthor[]>(initialComments);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  
  // Fix comment structure
  const processedComments = useMemo(() => ensureCommentStructure(comments), [comments]);
  
  // Use organizeCommentsIntoTree when rendering comments
  const organizedComments = useMemo(() => {
    const organized = organizeCommentsIntoTree(processedComments);
    console.log("Raw comments:", processedComments);
    console.log("Organized comments:", organized);
    return organized;
  }, [processedComments]);

  const fetchComments = async () => {
    try {
      setIsLoading(true);
      console.log(`Fetching comments for note ${noteId}...`);
      const response = await fetch(`/api/notes/${noteId}/comments`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`Received ${data.length} comments for note ${noteId}`);
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
  };

  useEffect(() => {
    fetchComments();
  }, [noteId]);

  const handleCommentSuccess = () => {
    fetchComments();
  };

  if (isLoading && !initialComments.length) {
    return (
      <div className="py-4 text-center text-muted-foreground">
        <div className="animate-pulse flex justify-center items-center">
          <div className="h-4 w-4 bg-primary/20 rounded-full mr-1"></div>
          <div className="h-4 w-24 bg-primary/20 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {organizedComments.length > 0 && (
        <div className="space-y-4 mb-4 max-h-[400px] overflow-y-auto pr-2">
          {organizedComments.map((comment) => (
            <NoteComment
              key={comment.id}
              comment={comment}
              noteId={noteId}
              onCommentUpdate={fetchComments}
            />
          ))}
        </div>
      )}

      <div className="pt-4 mt-4 border-t border-border/30">
        <NoteCommentForm 
          noteId={noteId}
          onSuccess={handleCommentSuccess}
        />
      </div>
    </div>
  );
}
