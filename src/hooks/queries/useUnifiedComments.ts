import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getBoardItemComments, addBoardItemComment, BoardItemType } from "@/actions/boardItemComment";
import { useAddTaskComment } from "@/hooks/queries/useTaskComment";

export type UnifiedItemType = 'task' | 'epic' | 'story' | 'milestone' | 'note';

// Unified hook for fetching comments
export function useUnifiedComments(itemType: UnifiedItemType, itemId: string) {
  // For tasks, use the existing task comments hook (but only enable it for tasks)
  const taskCommentsQuery = useQuery({
    queryKey: ["task-comments", itemId],
    queryFn: () => import("@/actions/taskComment").then(m => m.getTaskComments(itemId)),
    enabled: itemType === 'task' && !!itemId,
  });
  
  // For notes, use the note comments hook
  const noteCommentsQuery = useQuery({
    queryKey: ["note-comments", itemId],
    queryFn: () => import("@/actions/boardItemComment").then(m => m.getNoteComments(itemId)),
    enabled: itemType === 'note' && !!itemId,
  });
  
  // For other items, use board item comments
  const boardItemCommentsQuery = useQuery({
    queryKey: ["board-item-comments", itemType, itemId],
    queryFn: () => getBoardItemComments(itemType as BoardItemType, itemId),
    enabled: itemType !== 'task' && itemType !== 'note' && !!itemId,
  });

  // Return the appropriate query based on item type
  if (itemType === 'task') {
    return taskCommentsQuery;
  } else if (itemType === 'note') {
    return noteCommentsQuery;
  } else {
    return boardItemCommentsQuery;
  }
}

// Unified hook for adding comments
export function useAddUnifiedComment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Get the existing task comment mutation
  const addTaskCommentMutation = useAddTaskComment();

  // Create board item comment mutation
  const addBoardItemCommentMutation = useMutation({
    mutationFn: ({
      itemType,
      itemId,
      content,
      parentId,
    }: {
      itemType: BoardItemType;
      itemId: string;
      content: string;
      parentId?: string;
    }) => addBoardItemComment(itemType, itemId, content, parentId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["board-item-comments", variables.itemType, variables.itemId],
      });
      toast({
        title: "Success",
        description: "Comment added successfully",
      });
    },
    onError: (error) => {
      console.error("Error adding comment:", error);
      toast({
        title: "Error",
        description: "Failed to add comment",
        variant: "destructive",
      });
    },
  });

  // Return a unified mutation function
  return useMutation({
    mutationFn: async ({
      itemType,
      itemId,
      content,
      parentId,
    }: {
      itemType: UnifiedItemType;
      itemId: string;
      content: string;
      parentId?: string;
    }) => {
      if (itemType === 'task') {
        return addTaskCommentMutation.mutateAsync({
          taskId: itemId,
          content
        });
      } else if (itemType === 'note') {
        return import("@/actions/boardItemComment").then(m => 
          m.addNoteComment(itemId, content, parentId)
        );
      } else {
        return addBoardItemCommentMutation.mutateAsync({
          itemType: itemType as BoardItemType,
          itemId,
          content,
          parentId
        });
      }
    },
    onSuccess: (_, variables) => {
      // Invalidate the appropriate query
      if (variables.itemType === 'task') {
        queryClient.invalidateQueries({
          queryKey: ["task-comments", variables.itemId],
        });
      } else if (variables.itemType === 'note') {
        queryClient.invalidateQueries({
          queryKey: ["note-comments", variables.itemId],
        });
      } else {
        queryClient.invalidateQueries({
          queryKey: ["board-item-comments", variables.itemType, variables.itemId],
        });
      }
      toast({
        title: "Success",
        description: "Comment added successfully",
      });
    },
    onError: (error) => {
      console.error("Error adding comment:", error);
      toast({
        title: "Error",
        description: "Failed to add comment",
        variant: "destructive",
      });
    },
  });
} 