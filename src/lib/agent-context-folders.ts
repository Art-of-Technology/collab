import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { noteAccessWhere, noteWorkspaceWhere } from '@/lib/secrets/access';
import { stripHtmlToPlainText } from '@/lib/html-sanitizer';
import { ContextFolderError, contextFolderAccessWhere, requiredId } from '@/lib/context-folders';
import { readContextFilePrefix } from '@/lib/context-files';
import {
  contextDownloadUrl, contextPreviewKind, ContextPreviewKind, decodePreviewText, MAX_CONTEXT_PREVIEW_BYTES,
} from '@/lib/context-file-preview';
import { pdfText } from '@/lib/pdf-text';

/**
 * Context folders, notes and files, read by an agent's token.
 *
 * An agent reads what the account behind its token reads and nothing else: a folder belongs to a
 * workspace, or to one project inside it, and the token is issued for one workspace, so both are
 * asked of every read. Notes keep the rules they have everywhere else — personal, encrypted,
 * restricted, expired and secret-type Notes are not here, in a folder or outside one.
 *
 * A file is named by what it is, and its text is given back when it is text, a CSV or a PDF and it is
 * no larger than the limits stated here. Everything else — an image, an archive, a video — is named
 * with its type and size, so an agent knows what is there without the bytes.
 */

/** At most this much of a text or CSV file is read, and at most this much text comes out of a PDF. */
export const MAX_AGENT_TEXT_BYTES = MAX_CONTEXT_PREVIEW_BYTES;
/** A PDF is read whole, so one larger than this is named rather than read. */
export const MAX_AGENT_PDF_BYTES = 8 * 1024 * 1024;
/** Folders of one level, and items of one folder, are answered up to these counts. */
export const MAX_AGENT_FOLDERS = 500;
export const MAX_AGENT_FOLDER_ITEMS = 200;
/** Paging ends here: an offset past this is refused, and a page is never offered one it cannot use. */
export const MAX_AGENT_FOLDER_OFFSET = 50000;

const FOLDER_FIELDS = {
  id: true, name: true, parentId: true, projectId: true, updatedAt: true,
} satisfies Prisma.ContextFolderSelect;
type FolderRow = Prisma.ContextFolderGetPayload<{ select: typeof FOLDER_FIELDS }>;

/**
 * A Note reaches an agent only when it is shared, readable, unencrypted and not a secret document,
 * and when it belongs to the token's workspace — directly, or through the project it was written
 * for, which is how a project Note carries no workspace of its own.
 */
const agentNoteWhere = (userId: string, workspaceId: string): Prisma.NoteWhereInput => ({
  AND: [noteAccessWhere(userId), noteWorkspaceWhere(workspaceId)],
  scope: { in: ['WORKSPACE', 'PROJECT', 'PUBLIC'] },
  type: { notIn: ['ENV_VARS', 'API_KEYS', 'CREDENTIALS'] },
  isEncrypted: false,
});

export type FolderCard = {
  id: string; type: 'folder'; name: string; parentId: string | null;
  projectId: string | null; level: 'WORKSPACE' | 'PROJECT'; updatedAt: string; url: string;
};

/** Cards use parentId to preserve the tree across independently paged reads. */
function cards(rows: FolderRow[]): FolderCard[] {
  return rows.map(row => ({
    id: row.id, type: 'folder' as const, name: row.name, parentId: row.parentId,
    projectId: row.projectId, level: row.projectId ? 'PROJECT' as const : 'WORKSPACE' as const,
    updatedAt: row.updatedAt.toISOString(), url: `/api/apps/auth/context/folders/${encodeURIComponent(row.id)}`,
  }));
}

export function folderOffset(value: string | null): number {
  if (value === null) return 0;
  if (!/^\d+$/.test(value) || Number(value) > MAX_AGENT_FOLDER_OFFSET) {
    throw new ContextFolderError(400, `offset must be between 0 and ${MAX_AGENT_FOLDER_OFFSET}`);
  }
  return Number(value);
}

/**
 * Where the next page is read, and whether anything was left behind. A continuation is only given
 * when the read accepts it, so following `nextOffset` always ends: at the last supported offset a
 * page says `limitReached` instead, which is paging stopping before the rows do rather than a
 * continuation that comes back as a 400.
 */
function continuation(offset: number, limit: number, more: boolean) {
  const next = offset + limit;
  return {
    hasMore: more, limit, offset,
    nextOffset: more && next <= MAX_AGENT_FOLDER_OFFSET ? next : null,
    limitReached: more && next > MAX_AGENT_FOLDER_OFFSET,
  };
}

/** The live folders of a workspace, and of one project inside it, that this account reads. */
async function levelRows(userId: string, workspaceId: string, projectId: string | null, take: number, skip = 0): Promise<FolderRow[]> {
  return prisma.contextFolder.findMany({
    where: {
      AND: [contextFolderAccessWhere(userId)],
      workspaceId, deletedAt: null,
      ...(projectId ? { OR: [{ projectId: null }, { projectId }] } : { projectId: null }),
    },
    select: FOLDER_FIELDS,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take, skip,
  });
}

/**
 * The workspace's folders and, with a project, that project's as well. The project is not checked
 * here: a project of another workspace simply selects none of its folders.
 */
export async function agentFolderCards(userId: string, workspaceId: string, projectId: string | null, take = MAX_AGENT_FOLDERS): Promise<FolderCard[]> {
  return cards(await levelRows(userId, workspaceId, projectId, take));
}

export async function listAgentFolders(userId: string, workspaceId: string, projectId: string | null, offset = 0) {
  const folders = cards(await levelRows(userId, workspaceId, projectId, MAX_AGENT_FOLDERS + 1, offset));
  return {
    workspaceId,
    projectId,
    folders: folders.slice(0, MAX_AGENT_FOLDERS),
    ...continuation(offset, MAX_AGENT_FOLDERS, folders.length > MAX_AGENT_FOLDERS),
  };
}

export type FolderItem =
  | FolderCard
  | { id: string; type: 'note'; name: string; noteType: string; updatedAt: string; url: string }
  | { id: string; type: 'file'; name: string; mimeType: string; size: number; readable: boolean; updatedAt: string; url: string };

/**
 * One folder and what is in it: the folders under it, the Notes kept in it and the files uploaded to
 * it, each with its id, its name, what it is, where it is read and when it last changed.
 */
export async function readAgentFolder(userId: string, workspaceId: string, workspacePath: string, id: unknown, offset = 0) {
  const folderId = requiredId(id, 'A folder');
  const folder = await prisma.contextFolder.findFirst({
    where: { AND: [{ id: folderId, workspaceId, deletedAt: null }, contextFolderAccessWhere(userId)] },
    select: FOLDER_FIELDS,
  });
  if (!folder) throw new ContextFolderError(404, 'Folder not found');
  const [childRows, notes, files] = await Promise.all([
    prisma.contextFolder.findMany({
      where: { AND: [contextFolderAccessWhere(userId)], workspaceId, parentId: folder.id, deletedAt: null },
      select: FOLDER_FIELDS, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: MAX_AGENT_FOLDER_ITEMS + 1, skip: offset,
    }),
    prisma.note.findMany({
      where: { AND: [agentNoteWhere(userId, workspaceId)], folderId: folder.id },
      select: { id: true, title: true, type: true, updatedAt: true },
      orderBy: [{ title: 'asc' }, { id: 'asc' }], take: MAX_AGENT_FOLDER_ITEMS + 1, skip: offset,
    }),
    prisma.contextFile.findMany({
      where: { folderId: folder.id, deletedAt: null },
      select: { id: true, name: true, mimeType: true, size: true, updatedAt: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }], take: MAX_AGENT_FOLDER_ITEMS + 1, skip: offset,
    }),
  ]);
  const children = cards(childRows);
  const items: FolderItem[] = [
    ...children.slice(0, MAX_AGENT_FOLDER_ITEMS),
    ...notes.slice(0, MAX_AGENT_FOLDER_ITEMS).map(note => ({
      id: note.id, type: 'note' as const, name: stripHtmlToPlainText(note.title).slice(0, 300), noteType: note.type,
      updatedAt: note.updatedAt.toISOString(), url: `${workspacePath}/notes/${encodeURIComponent(note.id)}`,
    })),
    ...files.slice(0, MAX_AGENT_FOLDER_ITEMS).map(file => ({
      id: file.id, type: 'file' as const, name: file.name, mimeType: file.mimeType, size: file.size,
      // Whether its text can be read at all, so an agent knows before it asks for the file.
      readable: textBudget(file) > 0, updatedAt: file.updatedAt.toISOString(), url: contextDownloadUrl(file.id),
    })),
  ];
  return {
    folder: cards([folder])[0],
    items,
    ...continuation(offset, MAX_AGENT_FOLDER_ITEMS,
      children.length > MAX_AGENT_FOLDER_ITEMS || notes.length > MAX_AGENT_FOLDER_ITEMS || files.length > MAX_AGENT_FOLDER_ITEMS),
  };
}

/** What went wrong, in the two fields the app API answers with. A failure never carries a query or a host. */
export function agentContextFailure(error: unknown): { status: number; body: { error: string; error_description: string } } {
  const codes: Record<number, string> = {
    400: 'invalid_request', 403: 'forbidden', 404: 'not_found', 413: 'too_large', 502: 'storage_unavailable', 503: 'storage_unavailable',
  };
  if (error instanceof ContextFolderError) {
    return { status: error.status, body: { error: codes[error.status] ?? 'server_error', error_description: error.message } };
  }
  console.error('agent_context_read_failed', { category: error instanceof Error ? error.name : 'unknown' });
  return { status: 500, body: { error: 'server_error', error_description: 'Internal server error' } };
}

/** How much of a file is read: all of a PDF within its limit, the start of a text file, none of the rest. */
function textBudget(file: { name: string; mimeType: string; size: number }): number {
  const kind = contextPreviewKind(file);
  if (kind === 'text' || kind === 'csv') return MAX_AGENT_TEXT_BYTES;
  if (kind === 'pdf') return file.size <= MAX_AGENT_PDF_BYTES ? file.size : 0;
  return 0;
}

/** Why a file of this kind, or this size, is named rather than read. */
function unread(kind: ContextPreviewKind, file: { mimeType: string; size: number }): string {
  if (kind === 'pdf') {
    return file.size > MAX_AGENT_PDF_BYTES
      ? `This PDF is larger than the ${Math.round(MAX_AGENT_PDF_BYTES / (1024 * 1024))} MB that are read as text. Download it instead.`
      : 'No text could be read from this PDF. It may be a scan, or draw its text with fonts that say nothing about what they stand for.';
  }
  return `A ${file.mimeType} file is not read as text. Text, CSV and PDF files are; everything else is named, with its type and size.`;
}

/**
 * One file: what it is, and its text when it is one of the kinds that are read. `truncated` says the
 * file holds more than the text given back; `text` is null when there is none to give, and `reason`
 * says why.
 */
export async function readAgentFile(userId: string, workspaceId: string, id: unknown) {
  const { file, bytes } = await readContextFilePrefix(userId, id, workspaceId, textBudget);
  const kind = contextPreviewKind(file);
  const read = kind === 'pdf' ? await pdfText(bytes, MAX_AGENT_TEXT_BYTES)
    : kind === 'text' || kind === 'csv' ? { text: decodePreviewText(bytes), truncated: file.size > bytes.byteLength }
      : null;
  return {
    id: file.id, name: file.name, mimeType: file.mimeType, size: file.size, folderId: file.folderId,
    kind, text: read?.text ?? null, truncated: read?.truncated ?? false,
    ...(read ? {} : { reason: unread(kind, file) }),
    limits: { textBytes: MAX_AGENT_TEXT_BYTES, pdfBytes: MAX_AGENT_PDF_BYTES, pdfPages: 100 },
    updatedAt: file.updatedAt.toISOString(), url: contextDownloadUrl(file.id),
  };
}
