import type { IssueComment } from "../types/comment";

/**
 * Organize comments into a tree structure with replies nested under their parents
 */
export function organizeCommentsIntoTree(comments: IssueComment[]): IssueComment[] {
  const commentMap = new Map<string, IssueComment>();
  const rootComments: IssueComment[] = [];

  // First pass: create comment map
  comments.forEach(comment => {
    commentMap.set(comment.id, { ...comment, replies: [] });
  });

  // Second pass: organize into tree
  comments.forEach(comment => {
    const commentWithReplies = commentMap.get(comment.id)!;

    if (comment.parentId) {
      const parent = commentMap.get(comment.parentId);
      if (parent) {
        parent.replies = parent.replies || [];
        parent.replies.push(commentWithReplies);
      }
    } else {
      rootComments.push(commentWithReplies);
    }
  });

  return rootComments;
}

/**
 * Check if a user has liked a comment
 */
export function hasUserLikedComment(comment: IssueComment, userId?: string): boolean {
  if (!userId) return false;
  return comment.reactions?.some(r => r.type === "like" && r.author.id === userId) || false;
}

/**
 * Get the count of likes for a comment
 */
export function getLikeCount(comment: IssueComment): number {
  return comment.reactions?.filter(r => r.type === "like").length || 0;
}
