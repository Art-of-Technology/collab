import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import type { AppAuthContext } from '@/lib/apps/auth-middleware';
import { issueAccessWhere, issueReadAccessWhere } from '@/lib/issue-finder';
import { HandoffError, wasClaimed } from '@/lib/agent-handoffs';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const coordinatorSchema = z.object({
  project: id, agent: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  host: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/), sessionId: z.string().uuid(),
  generation: z.string().uuid(), event: z.enum(['acquire', 'renew', 'close']),
}).strict();
type Lease = z.infer<typeof coordinatorSchema> & { userId: string; agentId: string; closed: boolean; leaseUntil: string; worker?: { id: string; generation: string } };

export async function coordinatorLease(context: AppAuthContext, input: z.infer<typeof coordinatorSchema>) {
  return prisma.$transaction(async db => {
    await db.$queryRaw`SELECT id FROM "Project" WHERE id = ${input.project} AND "workspaceId" = ${context.workspace.id} FOR UPDATE`;
    const project = await db.project.findFirst({ where: { id: input.project, workspaceId: context.workspace.id, ...issueAccessWhere(context.user.id) } });
    if (!project || project.isArchived) throw new HandoffError('project_not_found', 'An active accessible project is required', 404);
    const agent = await db.agentRegistration.findFirst({ where: { workspaceId: context.workspace.id, userId: context.user.id, name: input.agent, host: input.host, sessionId: input.sessionId } });
    if (!agent || agent.managedWorker) throw new HandoffError('coordinator_identity', 'Use your registered coordinator host/session identity, not a managed worker', 403);
    const prior = project.coordinator as unknown as Lease | null;
    const bound = prior && prior.agentId === agent.id && prior.userId === context.user.id && prior.host === input.host && prior.sessionId === input.sessionId;
    const live = prior && !prior.closed && Date.parse(prior.leaseUntil) > Date.now();
    if (input.event === 'acquire' && prior?.generation !== input.generation && prior?.worker) {
      const worker = await db.agentRegistration.findUnique({ where: { id: prior.worker.id } });
      const state = worker?.managedWorker as { closed?: boolean } | null;
      if (state && !state.closed) throw new HandoffError('coordinator_conflict', 'Prior coordinator worker closure is unconfirmed', 409);
    }
    if (prior && (!bound || (input.event !== 'acquire' && prior.generation !== input.generation) ||
        (input.event === 'acquire' && live && prior.generation !== input.generation))) {
      throw new HandoffError('coordinator_conflict', 'The existing project coordinator owns this binding. A timeout is not a transfer of authority.', 409);
    }
    if (input.event === 'renew' && (!live || !bound) || input.event === 'close' && !bound ||
        input.event === 'acquire' && prior?.closed && prior.generation === input.generation) {
      throw new HandoffError('coordinator_fenced', 'This coordinator generation cannot continue', 409);
    }
    const lease = { ...input, userId: context.user.id, agentId: agent.id, closed: input.event === 'close', leaseUntil: new Date(Date.now() + 60000).toISOString(), ...(prior?.worker && { worker: prior.worker }) };
    // Heartbeats must not reorder the user's recently edited project list.
    await db.$executeRaw`UPDATE "Project" SET coordinator = ${JSON.stringify(lease)}::jsonb WHERE id = ${project.id}`;
    return { lease };
  });
}

export async function coordinatorSnapshot(context: AppAuthContext, projectId: string, cursor?: string) {
  id.parse(projectId); if (cursor) id.parse(cursor);
  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: context.workspace.id, ...issueAccessWhere(context.user.id) } });
  if (!project) throw new HandoffError('project_not_found', 'Project not found', 404);
  const items = await prisma.agentHandoff.findMany({
    where: { workspaceId: context.workspace.id, status: { in: ['open', 'claimed'] }, ...(cursor && { id: { gt: cursor } }),
      issue: { ...issueReadAccessWhere(context.user.id), workspaceId: context.workspace.id, projectId, project: { ...issueAccessWhere(context.user.id), workspaceId: context.workspace.id } } },
    orderBy: { id: 'asc' }, take: 51,
    select: { id: true, issueId: true, status: true, recipientNames: true, labelIds: true, updatedAt: true, createdAt: true,
      claimedBy: { select: { id: true, name: true } }, issue: { select: { issueKey: true, projectId: true } } },
  });
  const agents = await prisma.agentRegistration.findMany({ where: { workspaceId: context.workspace.id }, take: 501,
    select: { id: true, name: true, userId: true, labelIds: true, host: true, sessionId: true, managedWorker: true } });
  const visibleItems = await Promise.all(items.slice(0, 50).map(async item => ({ ...item, previouslyClaimed: await wasClaimed(prisma, context.workspace.id, item.issueId, item.id) })));
  return { project: project.id, lease: project.coordinator, items: visibleItems, nextCursor: items.length > 50 ? items[49].id : null,
    agents: agents.slice(0, 500).map(({ userId, ...agent }) => ({ ...agent, owned: userId === context.user.id })), agentsTruncated: agents.length > 500, observedAt: new Date().toISOString() };
}
