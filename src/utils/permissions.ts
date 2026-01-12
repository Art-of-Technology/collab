import { Session } from "next-auth";
import { NoteScope, NoteSharePermission } from "@prisma/client";

interface NoteWithPermissions {
  author: { id: string };
  authorId?: string;
  workspaceId?: string;
  scope?: NoteScope;
  sharedWith?: Array<{
    userId: string;
    permission: NoteSharePermission | string;
  }>;
  _permissions?: {
    isOwner?: boolean;
    canEdit?: boolean;
    canDelete?: boolean;
    canShare?: boolean;
  };
}

/**
 * Check if the current user can edit a note
 * @param session Current user session
 * @param note Note to check permissions for (supports both old and new format)
 * @returns Boolean indicating if the user can edit the note
 */
export function canEditNote(
  session: Session | null,
  note: NoteWithPermissions
): boolean {
  if (!session?.user?.id) {
    return false;
  }

  // If the API already computed permissions, use them
  if (note._permissions?.canEdit !== undefined) {
    return note._permissions.canEdit;
  }

  const userId = session.user.id;
  const authorId = note.authorId || note.author?.id;

  // User can always edit if they are the author
  if (userId === authorId) {
    return true;
  }

  // Check if user has EDIT permission via sharing
  if (note.sharedWith && note.sharedWith.length > 0) {
    const share = note.sharedWith.find(s => s.userId === userId);
    if (share && share.permission === NoteSharePermission.EDIT) {
      return true;
    }
  }

  return false;
}

/**
 * Check if the current user can delete a note
 * @param session Current user session
 * @param note Note to check permissions for
 * @returns Boolean indicating if the user can delete the note
 */
export function canDeleteNote(
  session: Session | null,
  note: NoteWithPermissions
): boolean {
  if (!session?.user?.id) {
    return false;
  }

  // If the API already computed permissions, use them
  if (note._permissions?.canDelete !== undefined) {
    return note._permissions.canDelete;
  }

  const userId = session.user.id;
  const authorId = note.authorId || note.author?.id;

  // Only the author can delete a note
  return userId === authorId;
}

/**
 * Check if the current user can share a note
 * @param session Current user session
 * @param note Note to check permissions for
 * @returns Boolean indicating if the user can share the note
 */
export function canShareNote(
  session: Session | null,
  note: NoteWithPermissions
): boolean {
  if (!session?.user?.id) {
    return false;
  }

  // If the API already computed permissions, use them
  if (note._permissions?.canShare !== undefined) {
    return note._permissions.canShare;
  }

  const userId = session.user.id;
  const authorId = note.authorId || note.author?.id;

  // Only the author can share a note
  // And only personal notes can be shared
  return userId === authorId && note.scope === NoteScope.PERSONAL;
}

/**
 * Check if the current user can view a note
 * @param session Current user session
 * @param note Note to check permissions for
 * @returns Boolean indicating if the user can view the note
 */
export function canViewNote(
  session: Session | null,
  note: NoteWithPermissions
): boolean {
  if (!session?.user?.id) {
    // Public notes can be viewed without auth
    return note.scope === NoteScope.PUBLIC;
  }

  const userId = session.user.id;
  const authorId = note.authorId || note.author?.id;

  // Author can always view their own notes
  if (userId === authorId) {
    return true;
  }

  // Check scope-based access
  switch (note.scope) {
    case NoteScope.PUBLIC:
    case NoteScope.WORKSPACE:
      // These are viewable by workspace members (checked at API level)
      return true;
    case NoteScope.PROJECT:
      // Project notes are viewable by project members (checked at API level)
      return true;
    case NoteScope.PERSONAL:
      // Check if shared with this user
      if (note.sharedWith && note.sharedWith.length > 0) {
        return note.sharedWith.some(s => s.userId === userId);
      }
      return false;
    default:
      return false;
  }
}
