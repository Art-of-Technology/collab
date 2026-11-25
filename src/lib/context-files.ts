import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { FileStorageError, fileStorageConfigured, openObject, removeObject, storeObject } from '@/lib/file-storage';
import { detectFileType } from '@/lib/context-file-type';
import {
  contextPreviewKind, csvPreview, decodePreviewText, isInlinePreview, MAX_CONTEXT_PREVIEW_BYTES, PreviewFile,
} from '@/lib/context-file-preview';
import {
  ContextFolderError, contextFolderAccessWhere, inTransaction, mayManageContent, requiredId,
} from '@/lib/context-folders';

/**
 * Files in Context folders.
 *
 * A file lives in one folder and is read by whoever reads that folder: the members of its workspace.
 * Its bytes are kept in Collab's own bucket, which only this server reaches, so there is no storage
 * address to copy or pass on. Every read goes through
 * `/api/context/files/[id]/download`, which asks who is calling first and then hands the bytes over as
 * an attachment that cannot run as a page of Collab's site.
 *
 * The size is checked against a stated limit, and the type is worked out from the content, never from
 * the name or from what the browser said. The row is what makes a file exist: it is written after the
 * bytes are stored, and bytes whose row cannot be written are taken back out, so a failed upload
 * leaves nothing behind.
 *
 * Errors use the folders' error class: a file's rules are the rules of the folder it is in.
 */

/** Stated limit. The bytes that arrived are measured, so a Content-Length that lies does not get past it. */
export const MAX_CONTEXT_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_CONTEXT_FILE_NAME = 200;

const STORAGE_PREFIX = 'context';

// `storageUrl` is left out of every read: where the bytes are is the server's business.
const FILE_FIELDS = {
  id: true, name: true, mimeType: true, size: true, folderId: true,
  uploadedById: true, createdAt: true, updatedAt: true, deletedAt: true, deletedById: true,
} satisfies Prisma.ContextFileSelect;

const FOLDER_FOR_FILE = {
  id: true, workspaceId: true, projectId: true,
} satisfies Prisma.ContextFolderSelect;

type Database = Prisma.TransactionClient | typeof prisma;

type FolderForFile = { id: string; workspaceId: string; projectId: string | null };
type LoadedFile = Prisma.ContextFileGetPayload<{ select: typeof FILE_FIELDS }> & {
  storageUrl: string;
  folder: FolderForFile;
};

/** The name is shown and is what a download is called, so it never carries a path or a control character. */
export function fileName(name: unknown): string {
  const raw = typeof name === 'string' ? name : '';
  const trimmed = (raw.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!trimmed || trimmed === '.' || trimmed === '..') throw new ContextFolderError(400, 'A file name is required');
  if (trimmed.length > MAX_CONTEXT_FILE_NAME) {
    throw new ContextFolderError(400, `A file name is at most ${MAX_CONTEXT_FILE_NAME} characters`);
  }
  return trimmed;
}

/** A file only ever goes in, or moves into, a folder that is not in Trash and that the caller reads. */
async function loadLiveFolder(db: Database, userId: string, id: unknown): Promise<FolderForFile> {
  const folderId = requiredId(id, 'A folder');
  const folder = await db.contextFolder.findFirst({
    where: { AND: [{ id: folderId, deletedAt: null }, contextFolderAccessWhere(userId)] },
    select: FOLDER_FOR_FILE,
  });
  if (!folder) throw new ContextFolderError(404, 'Folder not found');
  return folder;
}

/** A file in a folder that is in Trash went there with it: it is not found until the folder comes back. */
async function loadFile(db: Database, userId: string, id: unknown, trashed = false): Promise<LoadedFile> {
  const fileId = requiredId(id, 'A file');
  const file = await db.contextFile.findFirst({
    where: {
      id: fileId,
      deletedAt: trashed ? { not: null } : null,
      folder: { AND: [{ deletedAt: null }, contextFolderAccessWhere(userId)] },
    },
    select: {
      ...FILE_FIELDS, storageUrl: true,
      folder: { select: FOLDER_FOR_FILE },
    },
  });
  if (!file) throw new ContextFolderError(404, 'File not found');
  return file as LoadedFile;
}

/** Renaming, moving and deleting stay with whoever uploaded the file and the workspace's administrators. */
async function assertCanManage(db: Database, file: LoadedFile, userId: string) {
  if (file.uploadedById !== userId && !await mayManageContent(db, userId, file.folder.workspaceId)) {
    throw new ContextFolderError(403, 'Only the person who uploaded this file or a workspace administrator can change it');
  }
}

/** What a storage failure is to a caller: storage that is not there, or bytes that did not arrive. */
function storageFailure(error: unknown, message: string): unknown {
  if (!(error instanceof FileStorageError)) return error;
  return error.reason === 'not_configured'
    ? new ContextFolderError(503, 'File storage is not configured')
    : new ContextFolderError(502, message);
}

/** The bytes go into the bucket under a name storage makes up, so an upload never replaces another. */
async function storeBytes(bytes: Uint8Array): Promise<{ url: string; key: string }> {
  if (!fileStorageConfigured()) throw new ContextFolderError(503, 'File storage is not configured');
  try {
    const key = await storeObject(STORAGE_PREFIX, bytes);
    return { url: `storage:${key}`, key };
  } catch (error) { throw storageFailure(error, 'This file could not be stored'); }
}

/** This server writes these addresses itself, so what they name is known. */
export function storageKey(storageUrl: string): string {
  const match = /^storage:(context\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.exec(storageUrl);
  if (!match) throw new ContextFolderError(500, 'This file is not where it says it is');
  return match[1];
}

export async function listContextFiles(userId: string, input: { folderId: unknown; trashed?: boolean }) {
  const folder = await loadLiveFolder(prisma, userId, input.folderId);
  const files = await prisma.contextFile.findMany({
    where: { folderId: folder.id, deletedAt: input.trashed ? { not: null } : null },
    select: FILE_FIELDS,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  return { folderId: folder.id, files };
}

export async function uploadContextFile(userId: string, input: { folderId: unknown; name: unknown; bytes: Uint8Array }) {
  const name = fileName(input.name);
  const size = input.bytes.byteLength;
  if (!size) throw new ContextFolderError(400, 'This file is empty');
  if (size > MAX_CONTEXT_FILE_BYTES) {
    throw new ContextFolderError(413, `A file is at most ${Math.round(MAX_CONTEXT_FILE_BYTES / (1024 * 1024))} MB`);
  }
  // Who may write here is settled before anything is stored, so a refusal stores nothing at all.
  await loadLiveFolder(prisma, userId, input.folderId);
  const mimeType = detectFileType(input.bytes);
  const stored = await storeBytes(input.bytes);
  try {
    return await inTransaction(async db => {
      // Asked again inside the transaction: the folder may have gone into Trash while the bytes went up.
      const folder = await loadLiveFolder(db, userId, input.folderId);
      return db.contextFile.create({
        data: { name, mimeType, size, storageUrl: stored.url, folderId: folder.id, uploadedById: userId },
        select: FILE_FIELDS,
      });
    });
  } catch (error) {
    // Without its row the file does not exist, so the bytes do not stay behind either.
    // Bytes that could not be taken back are named, so they can be removed by hand: the name is made up
    // here, says nothing about the file, and opens nothing without the server's key.
    await removeObject(stored.key).catch(() => console.error('context_file_orphan_bytes', { object: stored.key }));
    throw error;
  }
}

export async function updateContextFile(userId: string, id: unknown, input: { name?: unknown; folderId?: unknown }) {
  const name = input.name !== undefined ? fileName(input.name) : undefined;
  const folderId = input.folderId !== undefined ? requiredId(input.folderId, 'A folder') : undefined;
  if (name === undefined && folderId === undefined) {
    throw new ContextFolderError(400, 'A new name or a new folder is required');
  }
  return inTransaction(async db => {
    const file = await loadFile(db, userId, id);
    await assertCanManage(db, file, userId);
    const data: Prisma.ContextFileUncheckedUpdateInput = {};
    if (name !== undefined) data.name = name;
    if (folderId !== undefined && folderId !== file.folderId) {
      const target = await loadLiveFolder(db, userId, folderId);
      // A folder is read by its workspace's members, so a file stays in its workspace: moving it never
      // hands it to anyone who could not already read it.
      if (target.workspaceId !== file.folder.workspaceId) {
        throw new ContextFolderError(400, 'A file moves only into a folder of its own workspace');
      }
      data.folderId = target.id;
    }
    return db.contextFile.update({ where: { id: file.id }, data, select: FILE_FIELDS });
  });
}

export async function trashContextFile(userId: string, id: unknown) {
  return inTransaction(async db => {
    const file = await loadFile(db, userId, id);
    await assertCanManage(db, file, userId);
    const deletedAt = new Date();
    await db.contextFile.update({ where: { id: file.id }, data: { deletedAt, deletedById: userId } });
    return { id: file.id, name: file.name, folderId: file.folderId, deletedAt };
  });
}

export async function restoreContextFile(userId: string, id: unknown) {
  return inTransaction(async db => {
    const file = await loadFile(db, userId, id, true);
    await assertCanManage(db, file, userId);
    await db.contextFile.update({ where: { id: file.id }, data: { deletedAt: null, deletedById: null } });
    return { id: file.id, name: file.name, folderId: file.folderId };
  });
}

/** The stored bytes. Only this server can ask storage for them, so nothing that outlives this request is passed on. */
async function openStorage(file: { storageUrl: string }): Promise<ReadableStream<Uint8Array>> {
  if (!fileStorageConfigured()) throw new ContextFolderError(503, 'File storage is not configured');
  try {
    return await openObject(storageKey(file.storageUrl));
  } catch (error) { throw storageFailure(error, 'This file could not be read from storage'); }
}

/** The bytes, for whoever may read the folder. */
export async function readContextFileBytes(userId: string, id: unknown) {
  const file = await loadFile(prisma, userId, id);
  return { file, body: await openStorage(file) };
}

/** Only the start of a file is read, and the rest is let go: a preview never buffers a whole upload. */
async function readPrefix(body: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let read = 0;
  try {
    while (read < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      read += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(Math.min(read, limit));
  let at = 0;
  for (const chunk of chunks) {
    if (at >= bytes.length) break;
    const part = chunk.subarray(0, bytes.length - at);
    bytes.set(part, at);
    at += part.byteLength;
  }
  return bytes;
}

/** What a file is, without saying where its bytes are kept. */
export type ContextFileFacts = PreviewFile & { folderId: string; createdAt: Date; updatedAt: Date };

/**
 * The first bytes of a file, for whoever may read the folder it is in, with a workspace the file must
 * be in: a token issued for one workspace reads no other, however the id was come by.
 *
 * How much to read is asked of `limit` once the file is known, so a type that is not read as text
 * never opens storage at all.
 */
export async function readContextFilePrefix(
  userId: string, id: unknown, workspaceId: string, limit: (file: ContextFileFacts) => number,
): Promise<{ file: ContextFileFacts; projectId: string | null; bytes: Uint8Array }> {
  const loaded = await loadFile(prisma, userId, id);
  if (loaded.folder.workspaceId !== workspaceId) throw new ContextFolderError(404, 'File not found');
  const file: ContextFileFacts = {
    id: loaded.id, name: loaded.name, mimeType: loaded.mimeType, size: loaded.size,
    folderId: loaded.folderId, createdAt: loaded.createdAt, updatedAt: loaded.updatedAt,
  };
  const wanted = limit(file);
  const bytes = wanted > 0 ? await readPrefix(await openStorage(loaded), wanted) : new Uint8Array(0);
  return { file, projectId: loaded.folder.projectId, bytes };
}

export type ContextFilePreview =
  | { kind: 'image' | 'pdf'; file: PreviewFile; body: ReadableStream<Uint8Array> }
  | { kind: 'text' | 'csv' | 'none'; file: PreviewFile; preview: Record<string, unknown> };

/**
 * What it takes to show a file without downloading it, for whoever may read the folder it is in.
 *
 * An image and a PDF are the bytes themselves, served the one way a browser draws them and nothing
 * else (`previewHeaders`). Text and a CSV are read here, at most `MAX_CONTEXT_PREVIEW_BYTES` of them,
 * and leave as JSON, so what the file holds is drawn as text and never as a page. Every other type is
 * named and not shown.
 */
export async function readContextFilePreview(userId: string, id: unknown): Promise<ContextFilePreview> {
  const loaded = await loadFile(prisma, userId, id);
  const file = { id: loaded.id, name: loaded.name, mimeType: loaded.mimeType, size: loaded.size };
  const kind = contextPreviewKind(file);
  if (isInlinePreview(kind)) return { kind, file, body: await openStorage(loaded) };
  if (kind === 'none') return { kind, file, preview: { ...file, kind } };
  const bytes = await readPrefix(await openStorage(loaded), MAX_CONTEXT_PREVIEW_BYTES);
  const truncated = file.size > bytes.byteLength;
  const text = decodePreviewText(bytes);
  return {
    kind,
    file,
    preview: kind === 'csv'
      ? { ...file, kind, ...csvPreview(text, truncated) }
      : { ...file, kind, text, truncated },
  };
}

/**
 * A file leaves as an attachment of one opaque type, never as a page of Collab's site: no sniffing, no
 * script, nothing kept by a shared cache, and no page may frame it — `frame-ancestors` is not covered
 * by `default-src`, and an API reply carries no policy of Collab's pages, so it is said here.
 */
export function downloadHeaders(file: { name: string }): Record<string, string> {
  const plain = file.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox; frame-ancestors 'none'",
    'Cache-Control': 'private, no-store',
  };
}
