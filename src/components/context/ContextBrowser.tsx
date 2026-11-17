'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, FolderPlus, Plus, Upload, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InputDialog } from '@/components/ui/input-dialog';
import { ContextFilePreview } from '@/components/context/ContextFilePreview';
import { ContextItemList, type ContextItem } from '@/components/context/ContextItemList';
import { ContextTree, type TreeFolder, type TreeRow, folderKey, rootKey } from '@/components/context/ContextTree';
import type { PreviewFile } from '@/lib/context-file-preview';

/**
 * The Context page: the folder tree on the left, the open folder's contents in the middle and the
 * preview of the file beside them.
 *
 * A folder belongs to the workspace or to one project in it, so the tree's top rows are those levels
 * and a folder is only ever created, filled or opened inside the level it belongs to. "New" offers
 * the three things that go into a folder: another folder, a Note and an uploaded file. The path says
 * where the open folder is and every part of it leads back there.
 *
 * On a narrow screen the three parts sit above each other, and the preview appears once a file is
 * chosen, so a phone shows one thing at a time rather than three columns side by side.
 */

type Level = { projectId: string | null };

type NoteItem = { id: string; title: string; type: string; updatedAt: string };
type FileItem = PreviewFile & { updatedAt: string };

async function readJson(response: Response) {
  // A reply that is not JSON is a reply that failed: what a parser calls it is not for a member to read.
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Something went wrong. Reload and try again.');
  }
  return body;
}

export function ContextBrowser({ workspaceId, workspaceSlug, projects, initialProjectId = null, initialFolderId = null }: {
  workspaceId: string;
  workspaceSlug: string;
  projects: { id: string; name: string }[];
  initialProjectId?: string | null;
  initialFolderId?: string | null;
}) {
  const router = useRouter();
  const [level, setLevel] = useState<Level>({ projectId: initialProjectId });
  const [openFolderId, setOpenFolderId] = useState<string | null>(initialFolderId);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([rootKey(initialProjectId)]));
  const [folders, setFolders] = useState<TreeFolder[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<'folder' | 'note' | null>(null);
  const upload = useRef<HTMLInputElement | null>(null);

  const roots = [{ projectId: null, name: 'Workspace' }, ...projects.map(project => ({ projectId: project.id, name: project.name }))];

  const readFolders = useCallback(async (projectId: string | null): Promise<TreeFolder[]> => {
    const query = new URLSearchParams({ workspace: workspaceId, ...(projectId && { project: projectId }) });
    return (await readJson(await fetch(`/api/context/folders?${query}`))).folders;
  }, [workspaceId]);

  const readItems = useCallback(async (projectId: string | null, folderId: string | null): Promise<{ notes: NoteItem[]; files: FileItem[] }> => {
    const query = new URLSearchParams(folderId
      ? { folder: folderId }
      : { workspace: workspaceId, ...(projectId && { project: projectId }) });
    return readJson(await fetch(`/api/context/items?${query}`));
  }, [workspaceId]);

  // What the page is showing. Only the newest read is drawn, so opening one folder while another is
  // still being read never leaves the slower answer on the page. A failed read says so.
  const reading = useRef(0);
  const show = useCallback(async (next: { projectId: string | null; folderId: string | null }) => {
    const mine = ++reading.current;
    setError(null);
    setSelectedFile(null);
    try {
      const [folderRows, items] = await Promise.all([
        readFolders(next.projectId), readItems(next.projectId, next.folderId),
      ]);
      if (mine !== reading.current) return;
      setFolders(folderRows);
      setNotes(items.notes);
      setFiles(items.files);
    } catch (failure) {
      if (mine !== reading.current) return;
      setError(failure instanceof Error ? failure.message : 'This folder could not be read');
    }
  }, [readFolders, readItems]);

  useEffect(() => { void show({ projectId: level.projectId, folderId: openFolderId }); }, [show, level.projectId, openFolderId]);

  // The open folder is part of the address, so a folder can be linked to and the back button works.
  useEffect(() => {
    const query = new URLSearchParams({
      ...(level.projectId && { project: level.projectId }),
      ...(openFolderId && { folder: openFolderId }),
    }).toString();
    router.replace(`/${workspaceSlug}/context${query ? `?${query}` : ''}`, { scroll: false });
  }, [router, workspaceSlug, level.projectId, openFolderId]);

  const expand = (key: string, open: boolean) => setExpanded(current => {
    const next = new Set(current);
    if (open) next.add(key); else next.delete(key);
    return next;
  });

  const openRow = (row: TreeRow) => {
    if (row.projectId !== level.projectId) setLevel({ projectId: row.projectId });
    setOpenFolderId(row.folderId);
    expand(row.folderId ? folderKey(row.folderId) : rootKey(row.projectId), true);
  };

  const openFolder = (folderId: string | null) => {
    setOpenFolderId(folderId);
    if (folderId) expand(folderKey(folderId), true);
  };

  // Where the open folder sits, from its level down to the folder itself. A folder is never inside
  // itself, and the walk stops at a folder it has already passed rather than going round for ever.
  const path: { id: string | null; name: string }[] = [];
  const seen = new Set<string>();
  for (let step = folders.find(row => row.id === openFolderId); step && !seen.has(step.id);) {
    seen.add(step.id);
    path.unshift({ id: step.id, name: step.name });
    step = folders.find(row => row.id === step?.parentId);
  }
  path.unshift({ id: null, name: roots.find(root => root.projectId === level.projectId)?.name ?? 'Workspace' });

  const items: ContextItem[] = [
    ...folders.filter(row => row.parentId === openFolderId).map(row => ({ kind: 'folder' as const, id: row.id, name: row.name })),
    ...notes.map(note => ({ kind: 'note' as const, id: note.id, name: note.title || 'Untitled', noteType: note.type, updatedAt: note.updatedAt })),
    ...files.map(file => ({ kind: 'file' as const, id: file.id, name: file.name, mimeType: file.mimeType, size: file.size, updatedAt: file.updatedAt })),
  ];

  const openItem = (item: ContextItem) => {
    if (item.kind === 'folder') return openFolder(item.id);
    if (item.kind === 'note') return router.push(`/${workspaceSlug}/notes/${item.id}`);
    setSelectedFile(files.find(file => file.id === item.id) ?? null);
  };

  /** A write, with what it changed read back, so the page never shows a folder it only hopes exists. */
  const write = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'This could not be saved');
    } finally {
      setBusy(false);
    }
  };

  const createFolder = (name: string) => write(async () => {
    const created = await readJson(await fetch('/api/context/folders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, projectId: level.projectId, parentId: openFolderId, name }),
    }));
    setAsking(null);
    setFolders(await readFolders(level.projectId));
    openFolder(created.id as string);
  });

  // A Note is created where the page is standing and then opened, so it is written in its own editor.
  const createNote = (title: string) => write(async () => {
    const created = await readJson(await fetch('/api/notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title, content: '<p></p>', type: 'GENERAL',
        scope: level.projectId ? 'PROJECT' : 'WORKSPACE',
        workspaceId, projectId: level.projectId, folderId: openFolderId,
      }),
    }));
    setAsking(null);
    router.push(`/${workspaceSlug}/notes/${created.id as string}`);
  });

  const uploadFile = (chosen: File | null) => {
    if (!chosen || !openFolderId) return;
    void write(async () => {
      const form = new FormData();
      form.append('file', chosen);
      form.append('folderId', openFolderId);
      await readJson(await fetch('/api/context/files', { method: 'POST', body: form }));
      setFiles((await readItems(level.projectId, openFolderId)).files);
    });
  };

  return <div className="flex h-full min-h-0 flex-col">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
      <nav aria-label="Path" className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
        {path.map((crumb, index) => <span key={crumb.id ?? 'root'} className="flex items-center gap-1">
          {index > 0 && <ChevronRight aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />}
          {index === path.length - 1
            ? <span aria-current="page" className="truncate font-medium">{crumb.name}</span>
            : <button type="button" onClick={() => openFolder(crumb.id)} className="truncate text-muted-foreground hover:underline">{crumb.name}</button>}
        </span>)}
      </nav>
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm"><a href={`/${workspaceSlug}/notes`}>All notes</a></Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" disabled={busy}><Plus className="mr-1 h-4 w-4" />New</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setAsking('folder')}><FolderPlus className="mr-2 h-4 w-4" />Folder</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setAsking('note')}><FileText className="mr-2 h-4 w-4" />Note</DropdownMenuItem>
            {/* A file always lives in a folder, so there is nowhere to put one at the top of a level. */}
            <DropdownMenuItem disabled={!openFolderId} onSelect={() => upload.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />Upload file
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input ref={upload} type="file" className="hidden" aria-hidden tabIndex={-1}
          onChange={event => { uploadFile(event.target.files?.[0] ?? null); event.target.value = ''; }} />
      </div>
    </header>

    {error && <p role="alert" className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <ContextTree
        roots={roots}
        folders={folders}
        levelProjectId={level.projectId}
        openFolderId={openFolderId}
        expanded={expanded}
        onExpand={(row, open) => {
          // A level's folders are read only while it is the open one, so showing another level's
          // folders means opening that level: its top, since no folder of it is open yet.
          if (open && row.projectId !== level.projectId) { openRow(row); return; }
          expand(row.folderId ? folderKey(row.folderId) : rootKey(row.projectId), open);
        }}
        onOpen={openRow}
        className="max-h-56 shrink-0 border-b p-2 md:max-h-none md:w-64 md:border-b-0 md:border-r"
      />
      <ContextItemList
        items={items}
        selectedId={selectedFile?.id ?? null}
        onOpen={openItem}
        emptyText={openFolderId ? 'This folder is empty.' : 'Nothing here yet. Use New to make a folder.'}
        className="shrink-0 border-b md:w-80 md:border-b-0 md:border-r"
      />
      <section className={`min-h-0 flex-1 flex-col p-3 ${selectedFile ? 'flex' : 'hidden md:flex'}`}>
        {selectedFile
          ? <ContextFilePreview file={selectedFile} className="min-h-0 flex-1" />
          : <p className="m-auto text-sm text-muted-foreground">Choose a file to see it here.</p>}
      </section>
    </div>

    <InputDialog
      open={asking === 'folder'} onOpenChange={open => setAsking(open ? 'folder' : null)}
      title="New folder" description="It is created where the page is standing."
      placeholder="Folder name" confirmText="Create" isLoading={busy} onConfirm={value => void createFolder(value)}
      validate={value => (value.trim() ? undefined : 'A folder name is required')}
    />
    <InputDialog
      open={asking === 'note'} onOpenChange={open => setAsking(open ? 'note' : null)}
      title="New note" description="It opens in the editor once it is created."
      placeholder="Note title" confirmText="Create" isLoading={busy} onConfirm={value => void createNote(value)}
      validate={value => (value.trim() ? undefined : 'A title is required')}
    />
  </div>;
}
