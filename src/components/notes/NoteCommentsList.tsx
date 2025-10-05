"use client";

import { useSession } from "next-auth/react";
import { UnifiedCommentsSection } from "@/components/ui/unified-comments-section";
import { UnifiedCommentData } from "@/components/ui/unified-comment";

interface NoteCommentsListProps {
  noteId: string;
  initialComments?: UnifiedCommentData[];
}

export function NoteCommentsList({ 
  noteId, 
  initialComments = []
}: NoteCommentsListProps) {
  const { data: session } = useSession();
  
  return (
    <UnifiedCommentsSection
      itemType="note"
      itemId={noteId}
      initialComments={initialComments}
      currentUserId={session?.user?.id}
    />
  );
}
