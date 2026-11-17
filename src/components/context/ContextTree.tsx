'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronRight, Folder, FolderOpen, Layers, Building2 } from 'lucide-react';

/**
 * The folder tree of Context.
 *
 * Its top rows are the levels a folder can belong to: the workspace, and every project in it. Under
 * the open level come its folders, each row a child of the row above it. One row at a time is in the
 * page's tab order and the arrow keys move between them, so the whole tree is reached without a
 * mouse: down and up walk the rows that are showing, right opens a row or steps into it, left closes
 * it or steps back out to the row it hangs from, and Enter opens what is focused.
 *
 * Opening a row is one thing and showing what is under it is another, so a row says both: `onOpen`
 * when it is chosen, `onExpand` when the arrow keys ask for its children or ask to put them away.
 */

export type TreeFolder = { id: string; name: string; parentId: string | null };
export type TreeRoot = { projectId: string | null; name: string };

export type TreeTarget = { projectId: string | null; folderId: string | null };

/** `position` and `siblings` count the rows that share this row's parent, as a screen reader announces them. */
export type TreeRow = TreeTarget & {
  key: string; name: string; depth: number; hasChildren: boolean; expanded: boolean; position: number; siblings: number;
};

export const rootKey = (projectId: string | null) => `root:${projectId ?? ''}`;
export const folderKey = (id: string) => `folder:${id}`;

/**
 * The rows that are showing, in the order they are drawn. A level's folders are known only while that
 * level is the open one, so another level's row has children to show once it is opened, never before.
 */
export function treeRows(
  roots: TreeRoot[], folders: TreeFolder[], levelProjectId: string | null, expanded: Set<string>,
): TreeRow[] {
  const children = (parentId: string | null) => folders.filter(folder => folder.parentId === parentId);
  const rows: TreeRow[] = [];
  const walk = (projectId: string | null, parentId: string | null, depth: number) => {
    const siblings = children(parentId);
    siblings.forEach((folder, index) => {
      const hasChildren = children(folder.id).length > 0;
      const open = expanded.has(folderKey(folder.id));
      rows.push({
        key: folderKey(folder.id), name: folder.name, depth, projectId, folderId: folder.id, hasChildren,
        expanded: open && hasChildren, position: index + 1, siblings: siblings.length,
      });
      if (open && hasChildren) walk(projectId, folder.id, depth + 1);
    });
  };
  roots.forEach((root, index) => {
    const isLevel = root.projectId === levelProjectId;
    const hasChildren = isLevel ? children(null).length > 0 : true;
    const open = expanded.has(rootKey(root.projectId)) && isLevel;
    rows.push({
      key: rootKey(root.projectId), name: root.name, depth: 0, projectId: root.projectId, folderId: null, hasChildren,
      expanded: open && hasChildren, position: index + 1, siblings: roots.length,
    });
    if (open) walk(root.projectId, null, 1);
  });
  return rows;
}

export function ContextTree({ roots, folders, levelProjectId, openFolderId, expanded, onExpand, onOpen, className = '' }: {
  roots: TreeRoot[];
  folders: TreeFolder[];
  levelProjectId: string | null;
  openFolderId: string | null;
  expanded: Set<string>;
  onExpand: (row: TreeRow, open: boolean) => void;
  onOpen: (row: TreeRow) => void;
  className?: string;
}) {
  const rows = treeRows(roots, folders, levelProjectId, expanded);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const items = useRef(new Map<string, HTMLButtonElement | null>());
  // The row that holds the tab stop: the one last focused while it is still showing, else the open one.
  const openKey = openFolderId ? folderKey(openFolderId) : rootKey(levelProjectId);
  const current = (focusKey && rows.some(row => row.key === focusKey) ? focusKey : null)
    ?? (rows.some(row => row.key === openKey) ? openKey : rows[0]?.key) ?? null;

  // Focus follows the arrow keys, and only then: a row that is merely drawn never takes focus away.
  const moving = useRef(false);
  useEffect(() => {
    if (!moving.current) return;
    moving.current = false;
    if (current) items.current.get(current)?.focus();
  }, [current]);

  const move = (to: string | undefined) => {
    if (!to) return;
    moving.current = true;
    setFocusKey(to);
  };

  const onKeyDown = (event: KeyboardEvent, row: TreeRow) => {
    const at = rows.findIndex(item => item.key === row.key);
    if (event.key === 'ArrowDown') { event.preventDefault(); move(rows[at + 1]?.key); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); move(rows[at - 1]?.key); return; }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (!row.expanded) onExpand(row, true);
      else move(rows[at + 1]?.key);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (row.expanded) { onExpand(row, false); return; }
      // Out to the row this one hangs from: the nearest row above that is drawn one step further left.
      for (let above = at - 1; above >= 0; above--) {
        if (rows[above].depth < row.depth) { move(rows[above].key); return; }
      }
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(row); }
  };

  return <div role="tree" aria-label="Context folders" className={`min-h-0 overflow-auto ${className}`}>
    {rows.map(row => {
      const selected = row.key === openKey;
      const Icon = row.depth === 0 ? (row.projectId ? Layers : Building2) : selected ? FolderOpen : Folder;
      return <button
        key={row.key}
        ref={element => { items.current.set(row.key, element); }}
        type="button"
        role="treeitem"
        aria-level={row.depth + 1}
        aria-posinset={row.position}
        aria-setsize={row.siblings}
        aria-selected={selected}
        {...(row.hasChildren && { 'aria-expanded': row.expanded })}
        tabIndex={row.key === current ? 0 : -1}
        onFocus={() => setFocusKey(row.key)}
        onKeyDown={event => onKeyDown(event, row)}
        onClick={() => onOpen(row)}
        className={`flex w-full items-center gap-1 rounded-md py-1.5 pr-2 text-left text-sm hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'bg-accent font-medium' : ''}`}
        style={{ paddingLeft: `${row.depth * 12 + 4}px` }}
      >
        <span aria-hidden onClick={event => { event.stopPropagation(); if (row.hasChildren) onExpand(row, !row.expanded); }} className={`flex h-7 w-7 shrink-0 items-center justify-center ${row.hasChildren ? '' : 'invisible'}`}>
          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${row.expanded ? 'rotate-90' : ''}`} />
        </span>
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{row.name}</span>
      </button>;
    })}
  </div>;
}
