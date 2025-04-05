"use client";

import { useMemo } from "react";
import { useTaskComments } from "@/hooks/queries/useTaskComment";
import { TaskComment, TaskCommentWithAuthor } from "@/components/tasks/TaskComment";
import { TaskCommentForm } from "@/components/tasks/TaskCommentForm";
import { 
  organizeTaskCommentsIntoTree
} from "@/utils/taskCommentHelpers";

interface TaskCommentsListProps {
  taskId: string;
  initialComments?: TaskCommentWithAuthor[];
  currentUserId?: string;
  userImage?: string | null;
}

export function TaskCommentsList({ 
  taskId, 
  initialComments = [],
  currentUserId: initialUserId,
  userImage
}: TaskCommentsListProps) {
  // Get comments using TanStack Query
  const { data, isLoading } = useTaskComments(taskId);
  
  // Use the comments from the query or fall back to initial comments
  const comments = data?.comments || initialComments;
  const currentUserId = data?.currentUserId || initialUserId || '';
  
  // Use organizeTaskCommentsIntoTree when rendering comments
  const organizedComments = useMemo(() => 
    organizeTaskCommentsIntoTree(comments), [comments]
  );

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
          currentUserId={currentUserId}
          userImage={userImage}
        />
      </div>
    </div>
  );
}