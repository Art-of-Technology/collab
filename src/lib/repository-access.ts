import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { postWorkspaceAccessWhere } from '@/lib/post-access';

/**
 * The response to send when the caller may not read a repository's data, or null when they may:
 * a signed-in user who owns or is an active member of the workspace the repository's project is in.
 */
export async function repositoryAccessDenied(repositoryId: string) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const repository = await prisma.repository.findFirst({
    where: { id: repositoryId, project: { workspace: postWorkspaceAccessWhere(user.id) } },
    select: { id: true },
  });
  return repository ? null : NextResponse.json({ error: 'Repository not found' }, { status: 404 });
}
