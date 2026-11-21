import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import { Permission, checkUserPermission } from '@/lib/permissions';
import { holdProjectDefault, projectRepositoryState, repositoryAddress } from '@/lib/agent-repository';

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
  if (request.headers.get('origin') !== new URL(process.env.NEXTAUTH_URL || request.url).origin) return reply({ error: 'Invalid request origin' }, 403);
  // Either the default among the project's connected repositories, or an address typed for a project that has none.
  const body = z.object({ repositoryId: z.string().min(1).max(128), url: z.string().trim().min(1).max(2048) }).partial().strict()
    .refine(data => !data.repositoryId !== !data.url).safeParse(await request.json().catch(() => null));
  if (!body.success) return reply({ error: 'Invalid request' }, 400);
  const { repositoryId, url } = body.data;
  const address = url ? repositoryAddress(url) : null;
  if (url && !address) return reply({ error: 'Type the https address of the repository, like https://github.com/org/repo, with no sign-in in it.' }, 400);
  return prisma.$transaction(async tx => {
    // Before the project's repositories are read: a disconnect running at the same time takes the same hold, so the
    // choice saved here is never a row that disconnect has removed, and it is never written over by its hand-over.
    await holdProjectDefault(tx, scope.project.id);
    const state = await projectRepositoryState(tx, scope.project.id);
    // A connected repository comes before a typed address, so one saved beside it would never be used.
    if (address && state.repositories.length) return reply({ error: 'This project has a connected repository, and its seats work in that.' }, 409);
    if (!address && !state.repositories.some(repository => repository.id === repositoryId)) {
      return reply({ error: 'Choose an active repository connected to this project.' }, 400);
    }
    await tx.project.update({ where: { id: scope.project.id }, data: address ? { agentRepositoryUrl: address.href } : { agentDefaultRepositoryId: repositoryId } });
    return reply({ ...await projectRepositoryState(tx, scope.project.id), canManage: true });
  });
}
