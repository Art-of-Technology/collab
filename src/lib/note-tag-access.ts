import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { postWorkspaceAccessWhere } from '@/lib/post-access';

export function noteTagAccessWhere(userId: string, workspaceId?: string | null): Prisma.NoteTagWhereInput {
  if (!userId) return { id: { in: [] } };
  return { OR: [
    { authorId: userId, workspaceId: null },
    ...(workspaceId === null ? [] : [{
      ...(workspaceId !== undefined ? { workspaceId } : {}),
      workspace: postWorkspaceAccessWhere(userId),
    }]),
  ] };
}

export async function noteTagConnections(
  userId: string, tagIds: unknown, workspaceId: string | null, projectId: string | null,
): Promise<Prisma.NoteTagWhereUniqueInput[] | null> {
  if (tagIds === undefined) return [];
  if (!Array.isArray(tagIds) || tagIds.some(id => typeof id !== 'string' || !id.trim())) return null;
  if (tagIds.length === 0) return [];
  let destination = workspaceId;
  if (!destination && projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspace: postWorkspaceAccessWhere(userId) },
      select: { workspaceId: true },
    });
    if (!project) return null;
    destination = project.workspaceId;
  }
  const ids = [...new Set<string>(tagIds)];
  const access = noteTagAccessWhere(userId, destination);
  const count = await prisma.noteTag.count({ where: { id: { in: ids }, AND: [access] } });
  return count === ids.length ? ids.map(id => ({ id, AND: [access] })) : null;
}
