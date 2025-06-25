// TaskCommentWithAuthor type moved to UnifiedComment
export type TaskCommentWithAuthor = {
  id: string;
  content: string;
  html?: string | null;
  createdAt: Date;
  author: {
    id: string;
    name: string | null;
    image: string | null;
    useCustomAvatar?: boolean;
  };
  reactions?: any[];
  parentId?: string | null;
  replies?: TaskCommentWithAuthor[];
};

/**
 * Organizes task comments into a hierarchical tree structure
 * @param comments Flat array of comments
 * @returns Array of top-level comments with nested replies
 */
export function organizeTaskCommentsIntoTree(comments: TaskCommentWithAuthor[]): TaskCommentWithAuthor[] {
  // Create a map of comments by ID for quick lookup
  const commentMap = new Map<string, TaskCommentWithAuthor>();

  // First pass: add all comments to the map
  comments.forEach(comment => {
    // Create a copy of the comment with an empty replies array if needed
    const commentWithReplies = {
      ...comment,
      replies: comment.replies || []
    };
    commentMap.set(comment.id, commentWithReplies);
  });

  // Second pass: organize into hierarchy
  const rootComments: TaskCommentWithAuthor[] = [];

  comments.forEach(comment => {
    if (!comment.parentId) {
      // This is a root comment
      rootComments.push(commentMap.get(comment.id)!);
    } else {
      // This is a reply
      const parent = commentMap.get(comment.parentId);
      if (parent) {
        if (!parent.replies) {
          parent.replies = [];
        }
        // Add this comment as a reply to its parent
        parent.replies.push(commentMap.get(comment.id)!);
      } else {
        // If parent not found, treat as root comment
        rootComments.push(commentMap.get(comment.id)!);
      }
    }
  });

  return rootComments;
}

/**
 * Initialize the liked task comments state from the comments array
 * @param comments Flat array of comments
 * @param currentUserId Current user's ID
 * @returns Record mapping comment IDs to boolean liked state
 */
export function initializeTaskLikedCommentsState(
  comments: TaskCommentWithAuthor[], 
  currentUserId: string
): Record<string, boolean> {
  const initialState: Record<string, boolean> = {};

  // Process all comments
  const processComment = (comment: TaskCommentWithAuthor) => {
    // Process the main comment
    initialState[comment.id] = comment.reactions?.some(
      reaction => reaction.authorId === currentUserId && reaction.type === "LIKE"
    ) || false;

    // Process any replies
    if (comment.replies && comment.replies.length > 0) {
      comment.replies.forEach(reply => {
        initialState[reply.id] = reply.reactions?.some(
          reaction => reaction.authorId === currentUserId && reaction.type === "LIKE"
        ) || false;

        // Recursively process nested replies if they exist
        if (reply.replies && reply.replies.length > 0) {
          processComment(reply);
        }
      });
    }
  };

  // Process all top-level comments
  comments.forEach(processComment);

  return initialState;
} 