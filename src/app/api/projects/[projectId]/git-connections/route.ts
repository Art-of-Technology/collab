import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import { EncryptionService } from '@/lib/encryption';
import { getActivity, getRepository, instances, listRepositories, providerSchema, ProviderError, resolveInstance } from '@/lib/git-providers/client';

type Context = { params: Promise<{ projectId: string }> };
const credentialsSchema = z.object({ token: z.string().min(1).max(8192), username: z.string().email().max(254).optional() });
const select = {
  id: true, provider: true, baseUrl: true, externalId: true, repositoryPath: true,
  name: true, url: true, isActive: true, syncedAt: true, connectedById: true,
  activity: { orderBy: { date: 'desc' as const }, take: 40, select: { id: true, externalId: true, kind: true, title: true, url: true, date: true, state: true } },
};
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
async function access(projectId: string) {
  const actor = await getCurrentUser();
  if (!actor) return { error: respond({ error: 'Unauthorized' }, 401) };
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspace: postWorkspaceAccessWhere(actor.id) },
    select: { id: true, workspace: { select: { ownerId: true } } },
  });
  if (!project) return { error: respond({ error: 'Project not found' }, 404) };
  return { actor, project };
}
function failure(error: unknown) {
  if (error instanceof ProviderError) return respond({ error: error.message }, 400);
  if (error instanceof z.ZodError || error instanceof SyntaxError) return respond({ error: 'Invalid request or provider response.' }, 400);
  return respond({ error: 'Unable to complete the Git connection request.' }, 500);
}
export async function GET(_request: NextRequest, context: Context) {
  try {
    const { projectId } = await context.params;
    const scope = await access(projectId); if (scope.error) return scope.error;
    const connections = await prisma.gitConnection.findMany({ where: { projectId }, select, orderBy: { createdAt: 'asc' } });
    return respond({ instances: instances(), connections: connections.map(c => ({ ...c, canManage: c.connectedById === scope.actor.id || scope.project.workspace.ownerId === scope.actor.id })) });
  } catch (error) { return failure(error); }
}
const inputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list'), provider: providerSchema, baseUrl: z.string().max(2048), credentials: credentialsSchema, page: z.number().int().min(1).max(3001).default(1), workspace: z.string().max(100).default('') }),
  z.object({ action: z.literal('connect'), provider: providerSchema, baseUrl: z.string().max(2048), credentials: credentialsSchema, repositoryPath: z.string().min(1).max(500) }),
  z.object({ action: z.literal('refresh'), id: z.string().min(1).max(100) }),
  z.object({ action: z.literal('disconnect'), id: z.string().min(1).max(100) }),
]);
export async function POST(request: NextRequest, context: Context) {
  try {
    const { projectId } = await context.params;
    const scope = await access(projectId); if (scope.error) return scope.error;
    // Requests arrive from the project UI; a foreign origin must never spend stored credentials.
    if (request.headers.get('origin') !== new URL(request.url).origin) return respond({ error: 'Invalid request origin' }, 403);
    const body = inputSchema.parse(await request.json());
    if (body.action === 'list') return respond(await listRepositories(resolveInstance(body.provider, body.baseUrl), body.credentials, body.page, body.workspace));
    if (body.action === 'disconnect' || body.action === 'refresh') {
      const connection = await prisma.gitConnection.findFirst({ where: { id: body.id, projectId } });
      if (!connection) return respond({ error: 'Connection not found' }, 404);
      if (connection.connectedById !== scope.actor.id && scope.project.workspace.ownerId !== scope.actor.id) return respond({ error: 'Only the connection owner or workspace owner can manage this connection.' }, 403);
      if (body.action === 'disconnect') {
        await prisma.gitConnection.update({ where: { id: connection.id }, data: { credentials: null, isActive: false } });
        return respond({ disconnected: true });
      }
      if (!connection.isActive || !connection.credentials) return respond({ error: 'Reconnect this repository before refreshing.' }, 400);
      const instance = resolveInstance(providerSchema.parse(connection.provider), connection.baseUrl);
      const credentials = credentialsSchema.parse(EncryptionService.decrypt(connection.credentials));
      const repository = await getRepository(instance, credentials, connection.repositoryPath);
      if (repository.id !== connection.externalId) return respond({ error: 'Repository identity changed. Reconnect the intended repository.' }, 409);
      const activity = await getActivity(instance, credentials, repository.path);
      await prisma.$transaction(async tx => {
        // A concurrent disconnect/reconnect must not resurrect or overwrite that connection.
        const updated = await tx.gitConnection.updateMany({ where: { id: connection.id, isActive: true, updatedAt: connection.updatedAt }, data: { syncedAt: new Date() } });
        if (updated.count !== 1) throw new ProviderError('Connection changed during refresh. Please reload.');
        for (const row of activity) await tx.gitConnectionActivity.upsert({
          where: { connectionId_kind_externalId: { connectionId: connection.id, kind: row.kind, externalId: row.id } },
          create: { connectionId: connection.id, externalId: row.id, kind: row.kind, title: row.title, url: row.url, date: new Date(row.date), state: row.state },
          update: { title: row.title, url: row.url, date: new Date(row.date), state: row.state },
        });
      });
      return respond({ refreshed: true });
    }
    const instance = resolveInstance(body.provider, body.baseUrl);
    const repository = await getRepository(instance, body.credentials, body.repositoryPath);
    const identity = { projectId, provider: instance.provider, baseUrl: instance.baseUrl, externalId: repository.id };
    const existing = await prisma.gitConnection.findUnique({ where: { projectId_provider_baseUrl_externalId: identity } });
    if (existing && existing.connectedById !== scope.actor.id && scope.project.workspace.ownerId !== scope.actor.id) return respond({ error: 'Only the connection owner or workspace owner can reconnect this repository.' }, 403);
    const activity = await getActivity(instance, body.credentials, repository.path);
    const encrypted = EncryptionService.encrypt(body.credentials);
    await prisma.$transaction(async tx => {
      const connection = existing
        ? await tx.gitConnection.update({ where: { id: existing.id, updatedAt: existing.updatedAt }, data: { credentials: encrypted, connectedById: scope.actor.id, isActive: true, syncedAt: new Date(), repositoryPath: repository.path, name: repository.name, url: repository.url } })
        : await tx.gitConnection.create({ data: { ...identity, connectedById: scope.actor.id, credentials: encrypted, repositoryPath: repository.path, name: repository.name, url: repository.url, syncedAt: new Date() } });
      for (const row of activity) await tx.gitConnectionActivity.upsert({
        where: { connectionId_kind_externalId: { connectionId: connection.id, kind: row.kind, externalId: row.id } },
        create: { connectionId: connection.id, externalId: row.id, kind: row.kind, title: row.title, url: row.url, date: new Date(row.date), state: row.state },
        update: { title: row.title, url: row.url, date: new Date(row.date), state: row.state },
      });
    });
    return respond({ connected: true });
  } catch (error) { return failure(error); }
}
