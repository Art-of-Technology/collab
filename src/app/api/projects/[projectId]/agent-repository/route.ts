import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import { Permission, checkUserPermission } from '@/lib/permissions';
import { holdProjectDefault, projectRepositoryState } from '@/lib/agent-repository';

type Context = { params: Promise<{ projectId: string }> };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
async function access(context: Context) {
  const actor = await getCurrentUser();
  if (!actor) return { error: reply({ error: 'Unauthorized' }, 401) };
  const { projectId } = await context.params;
  const project = await prisma.project.findFirst({ where: { id: projectId, workspace: postWorkspaceAccessWhere(actor.id) }, select: { id: true, workspaceId: true } });
  if (!project) return { error: reply({ error: 'Project not found' }, 404) };
  const { hasPermission: canManage } = await checkUserPermission(actor.id, project.workspaceId, Permission.MANAGE_WORKSPACE_PERMISSIONS);
  return { project, canManage };
}
export async function GET(_request: NextRequest, context: Context) {
  const scope = await access(context);
  if (scope.error) return scope.error;
  return reply({ ...await projectRepositoryState(prisma, scope.project.id), canManage: scope.canManage });
}
export async function PATCH(request: NextRequest, context: Context) {
  const scope = await access(context);
  if (scope.error) return scope.error;
  if (!scope.canManage) return reply({ error: 'Forbidden' }, 403);
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: 'Invalid request origin' }, 403);
  const body = z.object({ repositoryId: z.string().min(1).max(128) }).strict().safeParse(await request.json().catch(() => null));
  if (!body.success) return reply({ error: 'Invalid request' }, 400);
  return prisma.$transaction(async tx => {
    // Before the project's repositories are read: a disconnect running at the same time takes the same hold, so the
    // choice saved here is never a row that disconnect has removed, and it is never written over by its hand-over.
    await holdProjectDefault(tx, scope.project.id);
    const state = await projectRepositoryState(tx, scope.project.id);
    if (!state.repositories.some(repository => repository.id === body.data.repositoryId)) {
      return reply({ error: 'Choose an active repository connected to this project.' }, 400);
    }
    await tx.project.update({ where: { id: scope.project.id }, data: { agentDefaultRepositoryId: body.data.repositoryId } });
    return reply({ ...await projectRepositoryState(tx, scope.project.id), canManage: true });
  });
}
