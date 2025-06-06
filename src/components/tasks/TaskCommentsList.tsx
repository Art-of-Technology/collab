"use client";

import { useMemo } from "react";
import { useTaskComments } from "@/hooks/queries/useTaskComment";
import { TaskComment, TaskCommentWithAuthor } from "@/components/tasks/TaskComment";
import { TaskCommentForm } from "@/components/tasks/TaskCommentForm";
import { 
  organizeTaskCommentsIntoTree
} from "@/utils/taskCommentHelpers";

// Helper function to ensure comments have the required structure
const ensureCommentStructure = (comments: any[]): TaskCommentWithAuthor[] => {
  return comments.map(comment => ({
    ...comment,
    author: comment.author || {
      id: "unknown",
      name: "Unknown User",
      image: null
    },
    reactions: comment.reactions || [],
    // Recursively fix nested replies structure if they exist
    replies: comment.replies ? ensureCommentStructure(comment.replies) : undefined
  }));
};

interface TaskCommentsListProps {
  taskId: string;
  initialComments?: TaskCommentWithAuthor[];
  currentUserId?: string;
}

export function TaskCommentsList({ 
  taskId, 
  initialComments = [],
  currentUserId: initialUserId
}: TaskCommentsListProps) {
  // Get comments using TanStack Query
  const { data, isLoading } = useTaskComments(taskId);
  
  console.log("Comments from query:", data?.comments);
  console.log("Initial comments:", initialComments);
  
  // Fix comment structure and use the query data or fall back to initial comments
  const rawComments = data?.comments || initialComments;
  const comments = useMemo(() => ensureCommentStructure(rawComments), [rawComments]);
  const currentUserId = data?.currentUserId || initialUserId || '';
  
  console.log("Structured comments:", comments);
  
  // Use organizeTaskCommentsIntoTree when rendering comments
  const organizedComments = useMemo(() => 
    organizeTaskCommentsIntoTree(comments), [comments]
  );
  
  console.log("Organized comments:", organizedComments);

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
            <TaskComment
              key={comment.id}
              comment={comment}
              taskId={taskId}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}

      <div className="pt-4 mt-4 border-t border-border/30">
        <TaskCommentForm 
          taskId={taskId}
        />
      </div>
    </div>
  );
}