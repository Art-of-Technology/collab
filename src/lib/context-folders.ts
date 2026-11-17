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
 */

export class ContextFolderError extends Error {
  constructor(public status: number, message: string, public counts?: ContextFolderCounts) { super(message); }
}

export type ContextFolderCounts = { folders: number; notes: number; files: number };

export const MAX_FOLDER_NAME = 120;

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

function folderName(name: unknown): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw new ContextFolderError(400, 'A folder name is required');
  if (trimmed.length > MAX_FOLDER_NAME) throw new ContextFolderError(400, `A folder name is at most ${MAX_FOLDER_NAME} characters`);
  if (trimmed.includes('/')) throw new ContextFolderError(400, 'A folder name cannot contain "/"');
  return trimmed;
}

type Level = { workspaceId: string; projectId: string | null };

/** The workspace, or the one project inside it, that a folder belongs to. */
async function resolveLevel(userId: string, workspaceId: string | null, projectId: string | null): Promise<Level> {
  if (!workspaceId) throw new ContextFolderError(400, 'A workspace is required');
  const workspace = await prisma.workspace.findFirst({
    where: { AND: [{ OR: [{ id: workspaceId }, { slug: workspaceId }] }, membership(userId)] },
    select: { id: true },
  });
  if (!workspace) throw new ContextFolderError(404, 'Workspace not found');
  if (projectId && !await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id }, select: { id: true } })) {
    throw new ContextFolderError(404, 'Project not found in this workspace');
  }
  return { workspaceId: workspace.id, projectId: projectId || null };
}

type LoadedFolder = Prisma.ContextFolderGetPayload<{ select: typeof FOLDER_FIELDS }> & {
  workspace: { ownerId: string; members: { role: string }[] };
};

async function loadFolder(userId: string, id: string, trashed = false): Promise<LoadedFolder> {
  const folder = await prisma.contextFolder.findFirst({
    where: { AND: [{ id, deletedAt: trashed ? { not: null } : null }, contextFolderAccessWhere(userId)] },
    select: { ...FOLDER_FIELDS, workspace: { select: { ownerId: true, members: { where: { userId, status: true }, select: { role: true } } } } },
  });
  if (!folder) throw new ContextFolderError(404, 'Folder not found');
  return folder as LoadedFolder;
}

/** Renaming, moving, deleting and restoring stay with the folder's author and the workspace's administrators. */
function assertCanManage(folder: LoadedFolder, userId: string) {
  const isAdmin = folder.workspace.ownerId === userId ||
    folder.workspace.members.some(member => ['ADMIN', 'OWNER'].includes(member.role.toUpperCase()));
  if (folder.createdById !== userId && !isAdmin) {
    throw new ContextFolderError(403, 'Only the folder\'s author or a workspace administrator can change it');
  }
}

/**
 * Walk up from `parentId` to the top. Every folder on the way must be live and at the same level, which
 * also refuses moving a folder into its own descendant: the folder itself would be on that path.
 */
async function assertParentAtLevel(level: Level, parentId: string | null, movingId: string | null) {
  let current = parentId;
  const seen = new Set<string>();
  while (current) {
    if (current === movingId) throw new ContextFolderError(400, 'A folder cannot be moved into itself or into one of its own folders');
    if (seen.has(current)) throw new ContextFolderError(409, 'The folder tree changed; reload and retry');
    seen.add(current);
    const row: { id: string; parentId: string | null } | null = await prisma.contextFolder.findFirst({
      where: { id: current, deletedAt: null, workspaceId: level.workspaceId, projectId: level.projectId },
      select: { id: true, parentId: true },
    });
    if (!row) throw new ContextFolderError(404, 'Parent folder not found at this level');
    current = row.parentId;
  }
}

/** The folder and everything below it that `where` still selects. */
async function subtreeIds(rootId: string, where: Prisma.ContextFolderWhereInput): Promise<string[]> {
  const ids = [rootId];
  let frontier = [rootId];
  while (frontier.length) {
    const children: { id: string }[] = await prisma.contextFolder.findMany({
      where: { AND: [{ parentId: { in: frontier } }, where] }, select: { id: true },
    });
    frontier = children.map(child => child.id).filter(id => !ids.includes(id));
    ids.push(...frontier);
  }
  return ids;
}

async function contentCounts(folderIds: string[], rootId: string): Promise<ContextFolderCounts> {
  const [notes, files] = await Promise.all([
    prisma.note.count({ where: { folderId: { in: folderIds } } }),
    prisma.contextFile.count({ where: { folderId: { in: folderIds }, deletedAt: null } }),
  ]);
  return { folders: folderIds.filter(id => id !== rootId).length, notes, files };
}

export async function listContextFolders(userId: string, input: { workspaceId: string | null; projectId: string | null; trashed?: boolean }) {
  const level = await resolveLevel(userId, input.workspaceId, input.projectId);
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

export async function createContextFolder(userId: string, input: { workspaceId: string | null; projectId?: string | null; parentId?: string | null; name: unknown }) {
  const name = folderName(input.name);
  const level = await resolveLevel(userId, input.workspaceId, input.projectId || null);
  const parentId = input.parentId || null;
  await assertParentAtLevel(level, parentId, null);
  return prisma.contextFolder.create({
    data: { name, workspaceId: level.workspaceId, projectId: level.projectId, parentId, createdById: userId },
    select: FOLDER_FIELDS,
  });
}

export async function updateContextFolder(userId: string, id: string, input: { name?: unknown; parentId?: string | null }) {
  const folder = await loadFolder(userId, id);
  assertCanManage(folder, userId);
  const data: Prisma.ContextFolderUncheckedUpdateInput = {};
  if (input.name !== undefined) data.name = folderName(input.name);
  if (input.parentId !== undefined) {
    const parentId = input.parentId || null;
    await assertParentAtLevel({ workspaceId: folder.workspaceId, projectId: folder.projectId }, parentId, folder.id);
    data.parentId = parentId;
  }
  if (!Object.keys(data).length) throw new ContextFolderError(400, 'A new name or a new parent folder is required');
  return prisma.contextFolder.update({ where: { id: folder.id }, data, select: FOLDER_FIELDS });
}

/** What a delete would take with the folder, so the caller can ask first. */
export async function previewContextFolderTrash(userId: string, id: string) {
  const folder = await loadFolder(userId, id);
  const ids = await subtreeIds(folder.id, { deletedAt: null });
  return { id: folder.id, name: folder.name, counts: await contentCounts(ids, folder.id) };
}

export async function trashContextFolder(userId: string, id: string, confirm: boolean) {
  const folder = await loadFolder(userId, id);
  assertCanManage(folder, userId);
  const ids = await subtreeIds(folder.id, { deletedAt: null });
  const counts = await contentCounts(ids, folder.id);
  if (!confirm && (counts.folders || counts.notes || counts.files)) {
    throw new ContextFolderError(409, 'This folder is not empty. Confirm to move it and everything in it to Trash.', counts);
  }
  // One timestamp for the whole delete, so restoring takes back exactly what this delete put in Trash.
  const deletedAt = new Date();
  await prisma.contextFolder.updateMany({ where: { id: { in: ids }, deletedAt: null }, data: { deletedAt, deletedById: userId } });
  return { id: folder.id, name: folder.name, deletedAt, counts };
}

export async function restoreContextFolder(userId: string, id: string) {
  const folder = await loadFolder(userId, id, true);
  assertCanManage(folder, userId);
  if (folder.parentId) {
    const parent = await prisma.contextFolder.findFirst({ where: { id: folder.parentId }, select: { deletedAt: true } });
    if (!parent || parent.deletedAt) throw new ContextFolderError(409, 'Restore the folder this one is in first');
  }
  const ids = await subtreeIds(folder.id, { deletedAt: folder.deletedAt });
  await prisma.contextFolder.updateMany({ where: { id: { in: ids }, deletedAt: folder.deletedAt }, data: { deletedAt: null, deletedById: null } });
  return { id: folder.id, name: folder.name, folders: ids.length };
}

/**
 * The folder a note is being written into. A note and its folder must be at the same level, so who can
 * read the note and who can read the folder stay the same. Personal notes have no folders.
 */
export async function resolveNoteFolder(
  userId: string,
  folderId: unknown,
  note: { scope: string; workspaceId: string | null; projectId: string | null },
): Promise<string | null> {
  if (folderId === null || folderId === undefined || folderId === '') return null;
  if (typeof folderId !== 'string') throw new ContextFolderError(400, 'A folder id is required');
  if (note.scope === 'PERSONAL') throw new ContextFolderError(400, 'Personal notes are not kept in folders');
  const folder = await prisma.contextFolder.findFirst({
    where: { AND: [{ id: folderId, deletedAt: null }, contextFolderAccessWhere(userId)] },
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
