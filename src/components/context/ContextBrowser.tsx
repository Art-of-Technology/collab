'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, FolderPlus, Plus, Upload, FileText, LayoutTemplate } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InputDialog } from '@/components/ui/input-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ContextNotePane } from '@/components/context/ContextNotePane';
import { TemplatePickerDialog } from '@/components/notes/TemplatePickerDialog';
import { ContextFilePreview } from '@/components/context/ContextFilePreview';
import { ContextItemList, type ContextItem } from '@/components/context/ContextItemList';
import { ContextTree, type TreeFolder, type TreeRoot, type TreeRow, type TreeView, folderKey, rootKey } from '@/components/context/ContextTree';
import type { PreviewFile } from '@/lib/context-file-preview';

/**
 * The Context page: the folder tree on the left, the open folder's contents in the middle and, beside
 * them, the Note that is open in its editor or the preview of the chosen file. It is the only place a
 * Note is listed, opened and written.
 *
 * A folder belongs to the workspace or to one project in it, so the tree's rows for those levels hold
 * the folders, and a folder is only ever created, filled or opened inside the level it belongs to.
 * Above them are the workspace's three lists, which hold no folders: the pinned Notes, the reader's
 * personal Notes and the shared ones. "New" offers what goes into the open place: a folder, a Note,
 * blank or from a template, and an uploaded file. The path says where the open folder is and every
 * part of it leads back there.
 *
 * On a narrow screen the three parts sit above each other and the preview appears once a file is
 * chosen. An open Note takes the whole page there, so a phone shows one thing at a time.
 */

type Level = { projectId: string | null; view: TreeView | null };

type NoteItem = { id: string; title: string; type: string; updatedAt: string; isPinned?: boolean };

const VIEWS: { view: TreeView; name: string }[] = [
  { view: 'pinned', name: 'Pinned' }, { view: 'personal', name: 'Personal' }, { view: 'shared', name: 'Shared' },
];

const typeName = (type: string) => type.replace(/_/g, ' ').toLowerCase();
type FileItem = PreviewFile & { updatedAt: string };

async function readJson(response: Response) {
  // A reply that is not JSON is a reply that failed: what a parser calls it is not for a member to read.
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Something went wrong. Reload and try again.');
  }
  return body;
}

export function ContextBrowser({ workspaceId, workspaceSlug, projects, initialProjectId = null, initialFolderId = null, initialView = null, initialNoteId = null }: {
  workspaceId: string;
  workspaceSlug: string;
  projects: { id: string; name: string }[];
  initialProjectId?: string | null;
  initialFolderId?: string | null;
  initialView?: string | null;
  initialNoteId?: string | null;
}) {
  const router = useRouter();
  // A list holds no folders and belongs to no project, so an address that names one opens it alone.
  const [level, setLevel] = useState<Level>(() => {
    const view = VIEWS.find(row => row.view === initialView)?.view ?? null;
    return { projectId: view ? null : initialProjectId, view };
  });
  const [openFolderId, setOpenFolderId] = useState<string | null>(level.view ? null : initialFolderId);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([rootKey(initialProjectId)]));
  const [folders, setFolders] = useState<TreeFolder[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [moreNotes, setMoreNotes] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(initialNoteId);
  const [noteType, setNoteType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<'folder' | 'note' | 'template' | null>(null);
  const upload = useRef<HTMLInputElement | null>(null);
  // The folder open now, for a write that finishes after the page has moved on.
  const navigation = useRef(0);
  const openNow = useRef(openFolderId);
  openNow.current = openFolderId;

  const roots: TreeRoot[] = [
    ...VIEWS.map(row => ({ projectId: null, name: row.name, view: row.view })),
    { projectId: null, name: 'Workspace' }, ...projects.map(project => ({ projectId: project.id, name: project.name })),
  ];

  const readFolders = useCallback(async (projectId: string | null): Promise<TreeFolder[]> => {
    const query = new URLSearchParams({ workspace: workspaceId, ...(projectId && { project: projectId }) });
    return (await readJson(await fetch(`/api/context/folders?${query}`))).folders;
  }, [workspaceId]);

  const readItems = useCallback(async (at: Level, folderId: string | null, offset = 0): Promise<{ notes: NoteItem[]; files: FileItem[] }> => {
    const query = new URLSearchParams(folderId
      ? { folder: folderId }
      : { workspace: workspaceId, ...(at.view ? { view: at.view } : at.projectId && { project: at.projectId }) });
    if (offset) query.set('offset', String(offset));
    return readJson(await fetch(`/api/context/items?${query}`));
  }, [workspaceId]);

  // What the page is showing. Only the newest read is drawn, so opening one folder while another is
  // still being read never leaves the slower answer on the page. A failed read says so.
  const reading = useRef(0);
  const levelRead = useRef<string | undefined>(undefined);
  const show = useCallback(async (next: Level & { folderId: string | null }) => {
    const mine = ++reading.current;
    setError(null);
    setSelectedFile(null);
    // What was read for another folder is not this one's: nothing is listed until this read answers,
    // and another level's folders are not drawn under this one.
    setNotes([]);
    setMoreNotes(false);
    setFiles([]);
    setNoteType(null);
    const levelKey = rootKey(next.projectId, next.view);
    if (levelRead.current !== levelKey) setFolders([]);
    levelRead.current = levelKey;
    try {
      const [folderRows, items] = await Promise.all([
        next.view ? [] : readFolders(next.projectId), readItems(next, next.folderId),
      ]);
      if (mine !== reading.current) return;
      setFolders(folderRows);
      // A folder opened from a link is shown in the tree too, so every folder above it is opened.
      const above: string[] = [];
      for (let step = folderRows.find(row => row.id === next.folderId); step?.parentId && !above.includes(step.parentId);) {
        above.push(step.parentId);
        step = folderRows.find(row => row.id === step?.parentId);
      }
      if (next.folderId) {
        setExpanded(current => new Set([...current, rootKey(next.projectId), ...above.map(folderKey)]));
      }
      setNotes(items.notes);
      setMoreNotes(items.notes.length === 500);
      setFiles(items.files);
    } catch (failure) {
      if (mine !== reading.current) return;
      setError(failure instanceof Error ? failure.message : 'This folder could not be read');
    }
  }, [readFolders, readItems]);

  useEffect(() => {
    void show({ projectId: level.projectId, view: level.view, folderId: openFolderId });
  }, [show, level.projectId, level.view, openFolderId]);

  // The open folder and the open Note are part of the address, so either can be linked to and opened
  // again on reload. The address is replaced rather than added to, so the back button leaves the page.
  useEffect(() => {
    const query = new URLSearchParams({
      ...(level.view && { view: level.view }),
      ...(level.projectId && { project: level.projectId }),
      ...(openFolderId && { folder: openFolderId }),
      ...(selectedNoteId && { note: selectedNoteId }),
    }).toString();
    router.replace(`/${workspaceSlug}/context${query ? `?${query}` : ''}`, { scroll: false });
  }, [router, workspaceSlug, level.projectId, level.view, openFolderId, selectedNoteId]);

  const expand = (key: string, open: boolean) => setExpanded(current => {
    const next = new Set(current);
    if (open) next.add(key); else next.delete(key);
    return next;
  });

  const isOpenLevel = (row: TreeRow) => row.projectId === level.projectId && (row.view ?? null) === level.view;

  const openRow = (row: TreeRow) => {
    navigation.current++;
    setSelectedNoteId(null);
    if (!isOpenLevel(row)) setLevel({ projectId: row.projectId, view: row.view ?? null });
    setOpenFolderId(row.folderId);
    expand(row.folderId ? folderKey(row.folderId) : rootKey(row.projectId, row.view), true);
  };

  const openFolder = (folderId: string | null) => {
    navigation.current++;
    setSelectedNoteId(null);
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
  path.unshift({ id: null, name: roots.find(root => root.projectId === level.projectId && (root.view ?? null) === level.view)?.name ?? 'Workspace' });

  // The kinds of Note that are listed here, to choose one of: with a single kind there is nothing to choose.
  const noteTypes = [...new Set(notes.map(note => note.type))].sort();

  const items: ContextItem[] = [
    ...folders.filter(row => row.parentId === openFolderId).map(row => ({ kind: 'folder' as const, id: row.id, name: row.name })),
    ...notes.filter(note => !noteType || note.type === noteType)
      .map(note => ({ kind: 'note' as const, id: note.id, name: note.title || 'Untitled', noteType: note.type, pinned: note.isPinned, updatedAt: note.updatedAt })),
    ...files.map(file => ({ kind: 'file' as const, id: file.id, name: file.name, mimeType: file.mimeType, size: file.size, updatedAt: file.updatedAt })),
  ];

  const openItem = (item: ContextItem) => {
    if (item.kind === 'folder') return openFolder(item.id);
    // A Note opens here, beside the list, and a file's preview takes the same place.
    setSelectedNoteId(item.kind === 'note' ? item.id : null);
    setSelectedFile(item.kind === 'file' ? files.find(file => file.id === item.id) ?? null : null);
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
    const location = navigation.current;
    const created = await readJson(await fetch('/api/context/folders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, projectId: level.projectId, parentId: openFolderId, name }),
    }));
    setAsking(null);
    if (location !== navigation.current) return;
    const fresh = await readFolders(level.projectId);
    if (location !== navigation.current) return;
    setFolders(fresh);
    openFolder(created.id as string);
  });

  // A Note is created where the page is standing and then opened beside the list, in its editor.
  const postNote = async (fields: { title: string; content?: string; type?: string; templateId?: string | null }) => {
    const location = navigation.current;
    const created = await readJson(await fetch('/api/notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: '<p></p>', type: 'GENERAL', ...fields,
        scope: level.view === 'personal' ? 'PERSONAL' : level.projectId ? 'PROJECT' : 'WORKSPACE',
        workspaceId, projectId: level.projectId, folderId: openFolderId,
      }),
    }));
    setAsking(null);
    // Another place may have been opened while the Note was made: its list is not this one's.
    if (location === navigation.current) {
      setNotes(current => [...current, { id: created.id, title: fields.title, type: created.type, updatedAt: created.updatedAt }]);
    }
    setSelectedFile(null);
    setSelectedNoteId(created.id as string);
  };

  const createNote = (title: string) => write(() => postNote({ title }));

  // A template is filled in by the server, which knows its numbering and its placeholders.
  const createFromTemplate = (templateId: string, title?: string) => write(async () => {
    const filled = await readJson(await fetch(`/api/notes/templates/${templateId}/use`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, projectId: level.projectId, title }),
    }));
    await postNote({ title: filled.title, content: filled.content, type: filled.defaultType, templateId: filled.templateId });
  });

  const closeNote = () => {
    setSelectedNoteId(null);
    // The editor may have renamed the Note, so the list is read again, without emptying it first.
    const mine = reading.current;
    void readItems(level, openFolderId).then(fresh => {
      if (mine !== reading.current) return;
      setNotes(fresh.notes);
      setMoreNotes(fresh.notes.length === 500);
    }).catch(() => {});
  };

  const pinNote = (id: string, pin: boolean) => write(async () => {
    await readJson(await fetch(`/api/notes/${id}/pin`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }),
    }));
    setNotes(current => current.map(note => (note.id === id ? { ...note, isPinned: pin } : note)));
  });

  const deleteNote = (id: string) => write(async () => {
    await readJson(await fetch(`/api/notes/${id}`, { method: 'DELETE' }));
    setNotes(current => current.filter(note => note.id !== id));
    setSelectedNoteId(null);
  });

  const uploadFile = (chosen: File | null) => {
    const folderId = openFolderId;
    if (!chosen || !folderId) return;
    void write(async () => {
      const form = new FormData();
      form.append('file', chosen);
      form.append('folderId', folderId);
      await readJson(await fetch('/api/context/files', { method: 'POST', body: form }));
      const fresh = await readItems(level, folderId);
      // Another folder may have been opened while the file went up: its list is not this one's.
      if (openNow.current === folderId) setFiles(fresh.files);
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {/* A Note is pinned or shared from its editor, so nothing is made in those two lists. */}
            <Button size="sm" disabled={busy || level.view === 'pinned' || level.view === 'shared'}><Plus className="mr-1 h-4 w-4" />New</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!!level.view} onSelect={() => setAsking('folder')}><FolderPlus className="mr-2 h-4 w-4" />Folder</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setAsking('note')}><FileText className="mr-2 h-4 w-4" />Note</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setAsking('template')}><LayoutTemplate className="mr-2 h-4 w-4" />Note from template</DropdownMenuItem>
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
        levelView={level.view}
        openFolderId={openFolderId}
        expanded={expanded}
        onExpand={(row, open) => {
          // A level's folders are read only while it is the open one, so showing another level's
          // folders means opening that level: its top, since no folder of it is open yet.
          if (open && !isOpenLevel(row)) { openRow(row); return; }
          expand(row.folderId ? folderKey(row.folderId) : rootKey(row.projectId, row.view), open);
        }}
        onOpen={openRow}
        className={`max-h-56 shrink-0 border-b p-2 md:max-h-none md:w-64 md:border-b-0 md:border-r ${selectedNoteId ? 'hidden md:block' : ''}`}
      />
      <div className={`min-h-0 flex-col md:w-80 md:border-r ${selectedNoteId ? 'hidden md:flex' : 'flex'}`}>
      {noteTypes.length > 1 && <div className="border-b p-2">
        <Select value={noteType ?? 'all'} onValueChange={value => setNoteType(value === 'all' ? null : value)}>
          <SelectTrigger aria-label="Note type" className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All note types</SelectItem>
            {noteTypes.map(type => <SelectItem key={type} value={type} className="capitalize">{typeName(type)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>}
      <ContextItemList
        items={items}
        selectedId={selectedNoteId ?? selectedFile?.id ?? null}
        onOpen={openItem}
        emptyText={level.view ? 'No notes here.' : openFolderId ? 'This folder is empty.' : 'Nothing here yet. Use New to make a folder.'}
        className="min-h-0 flex-1 border-b"
      />
      {moreNotes && <Button variant="ghost" disabled={busy} onClick={() => void write(async () => {
        const mine = reading.current;
        const next = await readItems(level, openFolderId, notes.length);
        if (mine !== reading.current) return;
        setNotes(current => [...current, ...next.notes]);
        setMoreNotes(next.notes.length === 500);
      })}>Load more notes</Button>}
      </div>
      <section className={`min-h-0 min-w-0 flex-1 flex-col ${selectedNoteId ? 'flex' : `p-3 ${selectedFile ? 'flex' : 'hidden md:flex'}`}`}>
        {selectedNoteId
          ? <ContextNotePane
            key={selectedNoteId} noteId={selectedNoteId} workspaceId={workspaceId} busy={busy}
            // shortcut: a Note opened from a link that is past the 500 listed here reads as not pinned; read the Note itself if that is ever seen.
            pinned={notes.find(note => note.id === selectedNoteId)?.isPinned ?? false}
            onClose={closeNote}
            onPin={pin => void pinNote(selectedNoteId, pin)}
            onDelete={() => void deleteNote(selectedNoteId)}
          />
          : selectedFile
            ? <ContextFilePreview file={selectedFile} className="min-h-0 flex-1" />
            : <p className="m-auto text-sm text-muted-foreground">Choose a note or a file to see it here.</p>}
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
      title="New note" description="It opens beside the list once it is created."
      placeholder="Note title" confirmText="Create" isLoading={busy} onConfirm={value => void createNote(value)}
      validate={value => (value.trim() ? undefined : 'A title is required')}
    />
    <TemplatePickerDialog
      open={asking === 'template'} onOpenChange={open => setAsking(open ? 'template' : null)}
      workspaceId={workspaceId} projectId={level.projectId}
      onSelectTemplate={(template, title) => void createFromTemplate(template.id, title)}
      onStartBlank={() => setAsking('note')}
    />
  </div>;
}
