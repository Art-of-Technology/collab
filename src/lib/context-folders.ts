import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Context folders.
 *
 * A folder belongs to a workspace, or to one project inside it, and who can read it follows that:
 * every member of the workspace. A folder may sit inside another folder of the same level.
 *
 * Deleting a folder sets `deletedAt` on it and on everything below it, so its notes and files travel
 * with it into Trash and nothing is lost without a second, explicit step. A delete that would take
 * contents with it is refused with 409 and the counts until the caller confirms it.
 *
 * Every rule that reads the folder tree and then writes to it does both in one serializable
 * transaction, so a concurrent move cannot slip between the check and the write.
 */

export class ContextFolderError extends Error {
  constructor(public status: number, message: string, public counts?: ContextFolderCounts) { super(message); }
}

export type ContextFolderCounts = { folders: number; notes: number; files: number };

export const MAX_FOLDER_NAME = 120;

type Database = Prisma.TransactionClient | typeof prisma;

const FOLDER_FIELDS = {
  id: true, name: true, workspaceId: true, projectId: true, parentId: true,
  createdById: true, createdAt: true, updatedAt: true, deletedAt: true, deletedById: true,
} satisfies Prisma.ContextFolderSelect;

const membership = (userId: string) => ({
  OR: [{ ownerId: userId }, { members: { some: { userId, status: true } } }],
});

/** A folder is read by the members of its workspace; a project folder follows that project's workspace. */
export function contextFolderAccessWhere(userId: string): Prisma.ContextFolderWhereInput {
  if (!userId) return { id: { in: [] } };
  return { workspace: membership(userId) };
}

/** A client-supplied id is a string or nothing; an object would reach Prisma as a query operator. */
export function optionalId(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new ContextFolderError(400, `${field} must be an id`);
  return value;
}

export function requiredId(value: unknown, field: string): string {
  const id = optionalId(value, field);
  if (!id) throw new ContextFolderError(400, `${field} is required`);
  return id;
}

/** A body that is not a JSON object is a bad request, not a server failure. */
export async function readFolderBody(request: { json(): Promise<unknown> }): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new ContextFolderError(400, 'A JSON object body is required');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ContextFolderError(400, 'A JSON object body is required');
  }
  return parsed as Record<string, unknown>;
}

function folderName(name: unknown): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw new ContextFolderError(400, 'A folder name is required');
  if (trimmed.length > MAX_FOLDER_NAME) throw new ContextFolderError(400, `A folder name is at most ${MAX_FOLDER_NAME} characters`);
  if (trimmed.includes('/')) throw new ContextFolderError(400, 'A folder name cannot contain "/"');
  return trimmed;
}

type Level = { workspaceId: string; projectId: string | null };

/** The workspace, or the one project inside it, that a folder belongs to. */
async function resolveLevel(db: Database, userId: string, workspaceId: unknown, projectId: unknown): Promise<Level> {
  const workspaceKey = requiredId(workspaceId, 'A workspace');
  const projectKey = optionalId(projectId, 'A project');
  const workspace = await db.workspace.findFirst({
    where: { AND: [{ OR: [{ id: workspaceKey }, { slug: workspaceKey }] }, membership(userId)] },
    select: { id: true },
  });
  if (!workspace) throw new ContextFolderError(404, 'Workspace not found');
  if (projectKey && !await db.project.findFirst({ where: { id: projectKey, workspaceId: workspace.id }, select: { id: true } })) {
    throw new ContextFolderError(404, 'Project not found in this workspace');
  }
  return { workspaceId: workspace.id, projectId: projectKey };
}

/** The level a read is asking about, for callers outside this file that hold no transaction. */
export function resolveContextLevel(userId: string, workspaceId: unknown, projectId: unknown): Promise<Level> {
  return resolveLevel(prisma, userId, workspaceId, projectId);
}

type LoadedFolder = Prisma.ContextFolderGetPayload<{ select: typeof FOLDER_FIELDS }> & {
  workspace: { ownerId: string; members: { role: string }[] };
};

async function loadFolder(db: Database, userId: string, id: unknown, trashed = false): Promise<LoadedFolder> {
  const folderId = requiredId(id, 'A folder');
  const folder = await db.contextFolder.findFirst({
    where: { AND: [{ id: folderId, deletedAt: trashed ? { not: null } : null }, contextFolderAccessWhere(userId)] },
    select: { ...FOLDER_FIELDS, workspace: { select: { ownerId: true, members: { where: { userId, status: true }, select: { role: true } } } } },
  });
  if (!folder) throw new ContextFolderError(404, 'Folder not found');
  return folder as LoadedFolder;
}

/** The workspace's owner and its administrators, as selected for the caller alone. */
export function isWorkspaceAdmin(workspace: { ownerId: string; members: { role: string }[] }, userId: string): boolean {
  return workspace.ownerId === userId ||
    workspace.members.some(member => ['ADMIN', 'OWNER'].includes(member.role.toUpperCase()));
}

/** Renaming, moving, deleting and restoring stay with the folder's author and the workspace's administrators. */
function assertCanManage(folder: LoadedFolder, userId: string) {
  const isAdmin = isWorkspaceAdmin(folder.workspace, userId);
  if (folder.createdById !== userId && !isAdmin) {
    throw new ContextFolderError(403, 'Only the folder\'s author or a workspace administrator can change it');
  }
}

/**
 * Walk up from `parentId` to the top. Every folder on the way must be live and at the same level, which
 * also refuses moving a folder into its own descendant: the folder itself would be on that path.
 */
async function assertParentAtLevel(db: Database, level: Level, parentId: string | null, movingId: string | null) {
  let current = parentId;
  const seen = new Set<string>();
  while (current) {
    if (current === movingId) throw new ContextFolderError(400, 'A folder cannot be moved into itself or into one of its own folders');
    if (seen.has(current)) throw new ContextFolderError(409, 'The folder tree changed; reload and retry');
    seen.add(current);
    const row: { id: string; parentId: string | null } | null = await db.contextFolder.findFirst({
      where: { id: current, deletedAt: null, workspaceId: level.workspaceId, projectId: level.projectId },
      select: { id: true, parentId: true },
    });
    if (!row) throw new ContextFolderError(404, 'Parent folder not found at this level');
    current = row.parentId;
  }
}

/** The folder and everything below it that `where` still selects. */
async function subtreeIds(db: Database, rootId: string, where: Prisma.ContextFolderWhereInput): Promise<string[]> {
  const ids = [rootId];
  let frontier = [rootId];
  while (frontier.length) {
    const children: { id: string }[] = await db.contextFolder.findMany({
      where: { AND: [{ parentId: { in: frontier } }, where] }, select: { id: true },
    });
    frontier = children.map(child => child.id).filter(id => !ids.includes(id));
    ids.push(...frontier);
  }
  return ids;
}

async function contentCounts(db: Database, folderIds: string[], rootId: string): Promise<ContextFolderCounts> {
  const notes = await db.note.count({ where: { folderId: { in: folderIds } } });
  const files = await db.contextFile.count({ where: { folderId: { in: folderIds }, deletedAt: null } });
  return { folders: folderIds.filter(id => id !== rootId).length, notes, files };
}

/** One transaction for every rule that reads the folder tree before writing to it. */
export function inTransaction<T>(work: (db: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function listContextFolders(userId: string, input: { workspaceId: unknown; projectId: unknown; trashed?: boolean }) {
  const level = await resolveLevel(prisma, userId, input.workspaceId, input.projectId);
  const folders = await prisma.contextFolder.findMany({
    where: { workspaceId: level.workspaceId, projectId: level.projectId, deletedAt: input.trashed ? { not: null } : null },
    select: FOLDER_FIELDS,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  // Trash lists only the folder each delete started from; the rest went in with it.
  if (!input.trashed) return { folders };
  const trashedIds = new Set(folders.map(folder => folder.id));
  return { folders: folders.filter(folder => !folder.parentId || !trashedIds.has(folder.parentId)) };
}

export async function createContextFolder(userId: string, input: { workspaceId: unknown; projectId?: unknown; parentId?: unknown; name: unknown }) {
  const name = folderName(input.name);
  const parentId = optionalId(input.parentId, 'A parent folder');
  return inTransaction(async db => {
    const level = await resolveLevel(db, userId, input.workspaceId, input.projectId);
    await assertParentAtLevel(db, level, parentId, null);
    return db.contextFolder.create({
      data: { name, workspaceId: level.workspaceId, projectId: level.projectId, parentId, createdById: userId },
      select: FOLDER_FIELDS,
    });
  });
}

export async function updateContextFolder(userId: string, id: unknown, input: { name?: unknown; parentId?: unknown }) {
  const name = input.name !== undefined ? folderName(input.name) : undefined;
  const parentId = input.parentId !== undefined ? optionalId(input.parentId, 'A parent folder') : undefined;
  if (name === undefined && parentId === undefined) {
    throw new ContextFolderError(400, 'A new name or a new parent folder is required');
  }
  return inTransaction(async db => {
    const folder = await loadFolder(db, userId, id);
    assertCanManage(folder, userId);
    const data: Prisma.ContextFolderUncheckedUpdateInput = {};
    if (name !== undefined) data.name = name;
    if (parentId !== undefined) {
      await assertParentAtLevel(db, { workspaceId: folder.workspaceId, projectId: folder.projectId }, parentId, folder.id);
      data.parentId = parentId;
    }
    return db.contextFolder.update({ where: { id: folder.id }, data, select: FOLDER_FIELDS });
  });
}

/** What a delete would take with the folder, so the caller can ask first. */
export async function previewContextFolderTrash(userId: string, id: unknown) {
  const folder = await loadFolder(prisma, userId, id);
  const ids = await subtreeIds(prisma, folder.id, { deletedAt: null });
  return { id: folder.id, name: folder.name, counts: await contentCounts(prisma, ids, folder.id) };
}

export async function trashContextFolder(userId: string, id: unknown, confirm: boolean) {
  return inTransaction(async db => {
    const folder = await loadFolder(db, userId, id);
    assertCanManage(folder, userId);
    const ids = await subtreeIds(db, folder.id, { deletedAt: null });
    const counts = await contentCounts(db, ids, folder.id);
    if (!confirm && (counts.folders || counts.notes || counts.files)) {
      throw new ContextFolderError(409, 'This folder is not empty. Confirm to move it and everything in it to Trash.', counts);
    }
    // One timestamp for the whole delete, so restoring takes back exactly what this delete put in Trash.
    const deletedAt = new Date();
    await db.contextFolder.updateMany({ where: { id: { in: ids }, deletedAt: null }, data: { deletedAt, deletedById: userId } });
    return { id: folder.id, name: folder.name, deletedAt, counts };
  });
}

export async function restoreContextFolder(userId: string, id: unknown) {
  return inTransaction(async db => {
    const folder = await loadFolder(db, userId, id, true);
    assertCanManage(folder, userId);
    if (folder.parentId) {
      const parent = await db.contextFolder.findFirst({ where: { id: folder.parentId }, select: { deletedAt: true } });
      if (!parent || parent.deletedAt) throw new ContextFolderError(409, 'Restore the folder this one is in first');
    }
    const ids = await subtreeIds(db, folder.id, { deletedAt: folder.deletedAt });
    await db.contextFolder.updateMany({ where: { id: { in: ids }, deletedAt: folder.deletedAt }, data: { deletedAt: null, deletedById: null } });
    return { id: folder.id, name: folder.name, folders: ids.length };
  });
}

/**
 * The folder a note is being written into. A note and its folder must be at the same level, so who can
 * read the note and who can read the folder stay the same. Personal notes have no folders.
 *
 * This is asked again whenever a note's scope or project changes, not only when a folder is named, so a
 * note cannot be carried into another level while it sits in a folder of the old one.
 */
export async function resolveNoteFolder(
  userId: string,
  folderId: unknown,
  note: { scope: string; workspaceId: string | null; projectId: string | null },
): Promise<string | null> {
  const id = optionalId(folderId, 'A folder');
  if (!id) return null;
  if (note.scope === 'PERSONAL') throw new ContextFolderError(400, 'Personal notes are not kept in folders');
  const folder = await prisma.contextFolder.findFirst({
    where: { AND: [{ id, deletedAt: null }, contextFolderAccessWhere(userId)] },
    select: { id: true, workspaceId: true, projectId: true },
  });
  if (!folder) throw new ContextFolderError(404, 'Folder not found');
  const workspaceId = note.workspaceId || (note.projectId
    ? (await prisma.project.findUnique({ where: { id: note.projectId }, select: { workspaceId: true } }))?.workspaceId || null
    : null);
  if (folder.workspaceId !== workspaceId || folder.projectId !== (note.projectId || null)) {
    throw new ContextFolderError(400, 'The folder belongs to another workspace or project than the note');
  }
  return folder.id;
}
