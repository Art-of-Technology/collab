import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { cloudinary } from '@/utils/cloudinary-server';
import { detectFileType } from '@/lib/context-file-type';
import {
  ContextFolderError, contextFolderAccessWhere, inTransaction, isWorkspaceAdmin, requiredId,
} from '@/lib/context-folders';

/**
 * Files in Context folders.
 *
 * A file lives in one folder and is read by whoever reads that folder: the members of its workspace.
 * Its bytes are kept with the storage the other uploads use, as an authenticated asset, so the storage
 * address alone serves nothing — a copied link is useless to anyone. Every read goes through
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

const STORAGE_FOLDER = 'collab/context';

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
  folder: FolderForFile & { workspace: { ownerId: string; members: { role: string }[] } };
};

/** The name is shown and is what a download is called, so it never carries a path or a control character. */
function fileName(name: unknown): string {
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
      folder: { select: { ...FOLDER_FOR_FILE, workspace: { select: { ownerId: true, members: { where: { userId, status: true }, select: { role: true } } } } } },
    },
  });
  if (!file) throw new ContextFolderError(404, 'File not found');
  return file as LoadedFile;
}

/** Renaming, moving and deleting stay with whoever uploaded the file and the workspace's administrators. */
function assertCanManage(file: LoadedFile, userId: string) {
  if (file.uploadedById !== userId && !isWorkspaceAdmin(file.folder.workspace, userId)) {
    throw new ContextFolderError(403, 'Only the person who uploaded this file or a workspace administrator can change it');
  }
}

function storageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

/**
 * The bytes go up as a raw, authenticated asset: storage names it, and its address needs a signature
 * this server makes before it serves anything.
 */
async function storeBytes(bytes: Uint8Array): Promise<{ url: string; publicId: string }> {
  if (!storageConfigured()) throw new ContextFolderError(503, 'File storage is not configured');
  const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: STORAGE_FOLDER, resource_type: 'raw', type: 'authenticated', use_filename: false },
      (error, uploaded) => {
        if (!error && uploaded?.secure_url) return resolve(uploaded as { secure_url: string; public_id: string });
        // Storage failures can name hosts and keys, so the caller is told what happened, not where.
        console.error('context_file_storage_write_failed', { reason: error ? 'rejected' : 'empty' });
        reject(new ContextFolderError(502, 'This file could not be stored'));
      },
    );
    stream.end(Buffer.from(bytes));
  });
  return { url: result.secure_url, publicId: result.public_id };
}

/** This server writes these addresses itself, so what they name is known. */
export function storagePublicId(storageUrl: string): string {
  const match = /\/raw\/authenticated\/(?:s--[^/]+--\/)?(?:v\d+\/)?(.+)$/.exec(storageUrl);
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
    await cloudinary.uploader.destroy(stored.publicId, { resource_type: 'raw', type: 'authenticated' })
      .catch(() => console.error('context_file_orphan_bytes', { publicId: stored.publicId }));
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
    assertCanManage(file, userId);
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
    assertCanManage(file, userId);
    const deletedAt = new Date();
    await db.contextFile.update({ where: { id: file.id }, data: { deletedAt, deletedById: userId } });
    return { id: file.id, name: file.name, folderId: file.folderId, deletedAt };
  });
}

export async function restoreContextFile(userId: string, id: unknown) {
  return inTransaction(async db => {
    const file = await loadFile(db, userId, id, true);
    assertCanManage(file, userId);
    await db.contextFile.update({ where: { id: file.id }, data: { deletedAt: null, deletedById: null } });
    return { id: file.id, name: file.name, folderId: file.folderId };
  });
}

/**
 * The bytes, for whoever may read the folder. The signed address is made here and used here; it never
 * reaches the caller, so nothing that outlives this request can be passed on.
 */
export async function readContextFileBytes(userId: string, id: unknown) {
  const file = await loadFile(prisma, userId, id);
  if (!storageConfigured()) throw new ContextFolderError(503, 'File storage is not configured');
  const signed = cloudinary.url(storagePublicId(file.storageUrl), {
    resource_type: 'raw', type: 'authenticated', sign_url: true, secure: true,
  });
  const response = await fetch(signed);
  if (!response.ok || !response.body) {
    console.error('context_file_storage_read_failed', { status: response.status });
    throw new ContextFolderError(502, 'This file could not be read from storage');
  }
  return { file, body: response.body };
}

/**
 * A file leaves as an attachment of one opaque type, never as a page of Collab's site: no sniffing, no
 * script, nothing kept by a shared cache.
 */
export function downloadHeaders(file: { name: string }): Record<string, string> {
  const plain = file.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'private, no-store',
  };
}
