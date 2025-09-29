/*
 * This file is commented out as per manager's instructions.
 * We're now using the unified comment system instead of custom note comments.
 */

// Export types for compatibility with existing code
export type NoteCommentAuthor = {
  id: string;
  name: string | null;
  image: string | null;
};

export type NoteCommentWithAuthor = {
  id: string;
  message: string;
  html?: string | null;
  createdAt: string;
  updatedAt: string;
  author: NoteCommentAuthor;
  parentId?: string | null;
  reactions?: any[];
  children?: NoteCommentWithAuthor[];
};

// Empty export to avoid import errors
export function NoteComment() {
  return null;
}