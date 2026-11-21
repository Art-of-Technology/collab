'use client';

import { useState } from 'react';
import { Pin, PinOff, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { NoteFormEditor } from '@/components/notes/NoteFormEditor';

/**
 * A Note open in Context, beside the list it was chosen from: the editor itself, which saves as it is
 * typed in, under a bar that closes it, pins it and deletes it. A Note has no page of its own.
 */
export function ContextNotePane({ noteId, workspaceId, pinned, busy, onClose, onPin, onDelete, onSaved }: {
  noteId: string;
  workspaceId: string;
  pinned: boolean;
  busy: boolean;
  onClose: () => void;
  onPin: (pin: boolean) => void;
  onDelete: () => void;
  onSaved: (saved: { title: string; type: string }) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
      <Button variant="ghost" size="sm" onClick={onClose}><X className="mr-1 h-4 w-4" />Close</Button>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" disabled={busy} aria-pressed={pinned} onClick={() => onPin(!pinned)}>
          {pinned ? <PinOff className="mr-1 h-4 w-4" /> : <Pin className="mr-1 h-4 w-4" />}{pinned ? 'Unpin' : 'Pin'}
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirming(true)}>
          <Trash2 className="mr-1 h-4 w-4" />Delete
        </Button>
      </div>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <NoteFormEditor mode="edit" noteId={noteId} workspaceId={workspaceId} showCancelButton={false} onSaved={onSaved} />
    </div>
    <ConfirmDialog
      open={confirming} onOpenChange={setConfirming}
      title="Delete this note?" description="This cannot be undone."
      confirmText="Delete" isLoading={busy}
      onConfirm={() => { setConfirming(false); onDelete(); }}
    />
  </div>;
}
