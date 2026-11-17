'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { File, FileText, Folder } from 'lucide-react';
import { formatFileSize } from '@/lib/context-file-preview';

/**
 * What is in the open folder: the folders under it, the Notes kept in it and the files uploaded to
 * it, in that order. One row at a time is in the page's tab order, the arrow keys walk the rows and
 * Enter opens what is focused, so the list needs no mouse either.
 */

export type ContextItem =
  | { kind: 'folder'; id: string; name: string }
  | { kind: 'note'; id: string; name: string; noteType: string; updatedAt: string }
  | { kind: 'file'; id: string; name: string; mimeType: string; size: number; updatedAt: string };

const icons = { folder: Folder, note: FileText, file: File };

/** What a row says about itself under its name. */
function detail(item: ContextItem): string {
  if (item.kind === 'folder') return 'Folder';
  if (item.kind === 'note') return `Note · ${item.noteType.replace(/_/g, ' ').toLowerCase()}`;
  return `${item.mimeType} · ${formatFileSize(item.size)}`;
}

export function ContextItemList({ items, selectedId, onOpen, emptyText, className = '' }: {
  items: ContextItem[];
  selectedId: string | null;
  onOpen: (item: ContextItem) => void;
  emptyText: string;
  className?: string;
}) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLButtonElement | null>());
  const current = (focusId && items.some(item => item.id === focusId) ? focusId : null)
    ?? (items.some(item => item.id === selectedId) ? selectedId : items[0]?.id) ?? null;

  const moving = useRef(false);
  useEffect(() => {
    if (!moving.current) return;
    moving.current = false;
    if (current) rows.current.get(current)?.focus();
  }, [current]);

  const move = (to: string | undefined) => {
    if (!to) return;
    moving.current = true;
    setFocusId(to);
  };

  const onKeyDown = (event: KeyboardEvent, item: ContextItem) => {
    const at = items.findIndex(row => row.id === item.id);
    if (event.key === 'ArrowDown') { event.preventDefault(); move(items[at + 1]?.id); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); move(items[at - 1]?.id); return; }
    if (event.key === 'Home') { event.preventDefault(); move(items[0]?.id); return; }
    if (event.key === 'End') { event.preventDefault(); move(items[items.length - 1]?.id); return; }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(item); }
  };

  if (!items.length) return <p className={`p-6 text-center text-sm text-muted-foreground ${className}`}>{emptyText}</p>;

  return <div role="listbox" aria-label="Folder contents" className={`min-h-0 overflow-auto ${className}`}>
    {items.map(item => {
      const Icon = icons[item.kind];
      const selected = item.id === selectedId;
      return <button
        key={item.id}
        ref={element => { rows.current.set(item.id, element); }}
        type="button"
        role="option"
        aria-selected={selected}
        tabIndex={item.id === current ? 0 : -1}
        onKeyDown={event => onKeyDown(event, item)}
        onClick={() => onOpen(item)}
        className={`flex w-full items-center gap-3 border-b px-3 py-2 text-left hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'bg-accent' : ''}`}
      >
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{item.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{detail(item)}</span>
        </span>
      </button>;
    })}
  </div>;
}
