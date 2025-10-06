import { Session } from "next-auth";

/**
 * Check if the current user can edit a note
 * @param session Current user session
 * @param note Note to check permissions for
 * @returns Boolean indicating if the user can edit the note
 */
export function canEditNote(
  session: Session | null, 
  note: { author: { id: string }, workspaceId?: string }
): boolean {
  // User can edit if they are the author
  if (session?.user?.id === note.author.id) {
    return true;
  }
  
  // Add additional permission checks here if needed
  // For example, workspace admins might be able to edit all notes
  
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
  note: { author: { id: string }, workspaceId?: string }
): boolean {
  // Currently same as edit permissions, but separated for future flexibility
  return canEditNote(session, note);
}
