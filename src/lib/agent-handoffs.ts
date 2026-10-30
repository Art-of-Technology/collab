import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { AppAuthContext } from '@/lib/apps/auth-middleware';
import { issueReadAccessWhere } from '@/lib/issue-finder';
import { hasScope } from '@/lib/oauth-scopes';
import { managedStatus } from '@/lib/managed-worker-health';

const name = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const id = z.string().min(1).max(128);
const text = z.string().trim().min(1).max(16000);
const host = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/);
const sessionId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/);
export const registrationSchema = z.object({ name, labelIds: z.array(id).max(32).default([]),
  host: host.optional(), sessionId: sessionId.optional(),
}).strict().refine(v => Boolean(v.host) === Boolean(v.sessionId), 'Supply host and sessionId together');
export const heartbeatSchema = z.object({ agent: name, host, sessionId, watcherId: z.string().uuid(),
  event: z.enum(['started', 'poll', 'wake', 'stopped', 'error']),
  errorCode: z.string().regex(/^[a-z_]{1,64}$/).optional(),
}).strict().refine(v => (v.event === 'error') === Boolean(v.errorCode), 'Only error events require errorCode');
export const sendSchema = z.object({ agent: name, issue: id, content: text,
  generation: z.string().uuid().optional(),
  toAgents: z.array(name).max(32).default([]), toLabels: z.array(id).max(32).default([]),
  requestAck: z.boolean().default(false), requestId: z.string().uuid().optional(), afterId: id.optional(),
}).strict().refine(v => v.toAgents.length + v.toLabels.length > 0, 'Supply at least one recipient or label');
export const actionSchema = z.object({ agent: name, action: z.enum(['seen', 'ack', 'claim', 'progress', 'release', 'complete', 'supersede']),
  generation: z.string().uuid().optional(),
  coordinator: z.object({ project: id, generation: z.string().uuid() }).strict().optional(),
  content: text.optional(), replacementId: id.optional(),
}).strict().refine(v => !['progress', 'release', 'complete', 'supersede'].includes(v.action) || Boolean(v.content), 'This action requires content')
  .refine(v => (v.action === 'supersede') === Boolean(v.replacementId), 'Only supersede requires replacementId');
export const inboxSchema = z.object({ agent: name, limit: z.coerce.number().int().min(1).max(50).default(20),
  state: z.enum(['unseen', 'claimed']).default('unseen'),
  cursor: z.string().max(4096).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).strict();
export const transferOfferSchema = z.object({ agent: name, handoffId: id, toAgent: name,
  requestId: z.string().uuid(), content: text }).strict();
export const transferOfferActionSchema = z.object({ agent: name, action: z.enum(['accept', 'cancel']) }).strict();
export const transferOfferListSchema = z.object({ agent: name, limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(4096).regex(/^[A-Za-z0-9_-]+$/).optional() }).strict();

export class HandoffError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
type DB = Prisma.TransactionClient | typeof prisma;
const workerStates = ['idle', 'working', 'stopped', 'usage-limit', 'restart-limit', 'needs-login', 'config', 'uncertain', 'retrying'] as const;
export const workerSchema = z.object({ agent: name, host, sessionId,
  event: z.enum(['configure', 'start', 'renew', 'close']), generation: z.string().uuid().optional(),
  coordinator: z.object({ project: id, generation: z.string().uuid() }).strict().optional(),
  convert: z.boolean().optional(), labelIds: z.array(id).max(32).optional(),
  state: z.enum(workerStates).default('idle'), taskId: id.nullable().optional(),
  usage: z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), chargedUSD: z.number().finite().nonnegative(),
    reservedUSD: z.number().finite().nonnegative(), estimatedUSD: z.number().finite().nonnegative(),
    unknownUSD: z.number().finite().nonnegative(), restarts: z.number().int().min(0).max(100),
    starts: z.number().int().nonnegative(), totalStarts: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(),
    cacheReadTokens: z.number().int().nonnegative(), cacheWriteTokens: z.number().int().nonnegative(),
  }).strict().optional(),
}).strict().refine(v => v.event === 'configure' || Boolean(v.generation), 'Generation is required');
type ManagedWorker = { generation: string | null; closed: boolean; leaseUntil: string | null; heartbeatAt: string;
  state: typeof workerStates[number]; taskId?: string | null; usage?: z.infer<typeof workerSchema>['usage']; coordinator?: { project: string; generation: string } };
type CoordinatorLease = { userId: string; generation: string; closed: boolean; leaseUntil: string; worker?: { id: string; generation: string } };
async function coordinatorAdmission(db: Prisma.TransactionClient, context: AppAuthContext, binding: { project: string; generation: string }) {
  await db.$queryRaw`SELECT id FROM "Project" WHERE id = ${binding.project} AND "workspaceId" = ${context.workspace.id} FOR UPDATE`;
  const project = await db.project.findFirst({ where: { id: binding.project, workspaceId: context.workspace.id }, select: { coordinator: true } });
  const lease = project?.coordinator as unknown as CoordinatorLease | null;
  if (!lease || lease.userId !== context.user.id || lease.generation !== binding.generation || lease.closed || !(Date.parse(lease.leaseUntil) > Date.now())) throw new HandoffError('coordinator_fenced', 'A live matching coordinator generation is required', 409);
  return lease;
}
export async function wasClaimed(db: DB, workspaceId: string, issueId: string, handoffId: string) {
  return Boolean(await db.issueActivity.findFirst({ where: { workspaceId, itemId: issueId, itemType: 'ISSUE', action: 'AGENT_CLAIM', details: { contains: `"handoffId":${JSON.stringify(handoffId)}` } }, select: { id: true } }));
}
function assertManagedGeneration(value: Prisma.JsonValue | null, generation?: string) {
  if (!value) {
    if (generation) throw new HandoffError('worker_not_managed', 'This agent is not managed', 409);
    return;
  }
  const worker = value as unknown as ManagedWorker;
  if (!generation || worker.generation !== generation || worker.closed || !(Date.parse(worker.leaseUntil || '') > Date.now())) {
    throw new HandoffError('worker_fenced', 'A live matching managed generation is required', 409);
  }
}
export async function manageWorker(context: AppAuthContext, input: z.infer<typeof workerSchema>) {
  if (!hasScope('issues:write', context.token.scopes)) throw new HandoffError('insufficient_scope', 'Managed workers require issues:write', 403);
  if (input.event === 'configure' && !['workspace:write', 'issues:read'].every(scope => hasScope(scope, context.token.scopes))) {
    throw new HandoffError('insufficient_scope', 'Worker configuration requires workspace:write and issues:read', 403);
  }
  return prisma.$transaction(async db => {
    const lease = input.event === 'start' && input.coordinator ? await coordinatorAdmission(db, context, input.coordinator) : null;
    await db.$queryRaw`SELECT id FROM "AgentRegistration" WHERE "workspaceId" = ${context.workspace.id} AND name = ${input.agent} FOR UPDATE`;
    let agent = await db.agentRegistration.findUnique({ where: { workspaceId_name: { workspaceId: context.workspace.id, name: input.agent } } });
    if (agent && agent.userId !== context.user.id) throw new HandoffError('agent_name_taken', 'This agent belongs to another user', 403);
    const now = new Date().toISOString();
    if (input.event === 'configure') {
      if (agent && !agent.managedWorker && (!input.convert || watcherState(agent.watcher)?.state === 'running' ||
          await db.agentHandoff.count({ where: { claimedById: agent.id, status: 'claimed' } }))) {
        throw new HandoffError('worker_conversion_required', 'Explicit conversion requires stopped watchers and no claimed manual work', 409);
      }
      const prior = agent?.managedWorker as unknown as ManagedWorker | null;
      if (prior && (!prior.closed || agent!.host !== input.host || agent!.sessionId !== input.sessionId)) throw new HandoffError('worker_active', 'Close the owned generation before changing configuration', 409);
      const labels = input.labelIds ? await validLabels(db, context.workspace.id, input.labelIds) : agent?.labelIds || [];
      const data = { host: input.host, sessionId: input.sessionId, labelIds: labels,
        managedWorker: prior || { generation: null, closed: true, leaseUntil: null, heartbeatAt: now, state: 'stopped' } };
      agent = agent ? await db.agentRegistration.update({ where: { id: agent.id }, data }) :
        await db.agentRegistration.create({ data: { workspaceId: context.workspace.id, userId: context.user.id, name: input.agent, ...data } });
      return { worker: managedStatus(agent.managedWorker) };
    }
    if (!agent?.managedWorker || agent.host !== input.host || agent.sessionId !== input.sessionId) throw new HandoffError('worker_binding_changed', 'Configure this exact owned worker first', 409);
    const prior = agent.managedWorker as unknown as ManagedWorker;
    if (input.event === 'start') {
      if (lease?.worker) {
        const owner = await db.agentRegistration.findUnique({ where: { id: lease.worker.id } });
        const active = owner?.managedWorker as unknown as ManagedWorker | null;
        if (active && !active.closed && (lease.worker.id !== agent.id || lease.worker.generation !== input.generation)) throw new HandoffError('coordinator_conflict', 'Prior coordinator worker closure is unconfirmed', 409);
      }
      if (!prior.closed) {
        assertManagedGeneration(agent.managedWorker, input.generation);
        return { worker: managedStatus(agent.managedWorker) };
      }
      if (prior.generation === input.generation) throw new HandoffError('worker_fenced', 'Closed generations cannot restart', 409);
    } else if (input.event === 'close') {
      if (prior.generation !== input.generation) throw new HandoffError('worker_fenced', 'Only the owned generation can confirm closure', 409);
    } else assertManagedGeneration(agent.managedWorker, input.generation);
    const worker = { generation: input.generation!, closed: input.event === 'close', heartbeatAt: now,
      leaseUntil: input.event === 'close' ? null : new Date(Date.now() + 60000).toISOString(),
      state: input.event === 'close' && input.state === 'idle' ? 'stopped' : input.state,
      taskId: input.taskId ?? null, ...((input.event === 'start' ? input.coordinator : prior.coordinator) && { coordinator: input.event === 'start' ? input.coordinator : prior.coordinator }), ...(input.usage && { usage: input.usage }) };
    await db.agentRegistration.update({ where: { id: agent.id }, data: { managedWorker: worker } });
    if (lease && input.coordinator) await db.$executeRaw`UPDATE "Project" SET coordinator = ${JSON.stringify({ ...lease, worker: { id: agent.id, generation: input.generation } })}::jsonb WHERE id = ${input.coordinator.project}`;
    return { worker: managedStatus(worker) };
  });
}
type InboxContext = { user: { id: string }; workspace: { id: string } };
type Agent = { id: string; name: string; userId: string; labelIds: string[] };
type Watcher = { id: string; state: 'running' | 'stopped' | 'error'; startedAt: string; heartbeatAt: string;
  lastPollAt: string | null; lastWakeAt: string | null; errorCode: string | null };
const watcherStaleMs = 300000;
function watcherState(value: Prisma.JsonValue | null) {
  const watcher = value as Watcher | null;
  if (!watcher?.id) return null;
  return { ...watcher, state: watcher.state === 'running' && Date.now() - Date.parse(watcher.heartbeatAt) >= watcherStaleMs ? 'stale' as const : watcher.state };
}
function agentStatus(agent: { id: string; name: string; labelIds: string[]; host: string | null; sessionId: string | null; watcher: Prisma.JsonValue | null; managedWorker?: Prisma.JsonValue | null }) {
  return { id: agent.id, name: agent.name, labelIds: agent.labelIds,
    worker: managedStatus(agent.managedWorker),
    ...(agent.host && { host: agent.host, sessionId: agent.sessionId, watcher: watcherState(agent.watcher) }) };
}
function issueScope(context: InboxContext): Prisma.IssueWhereInput {
  return { AND: [issueReadAccessWhere(context.user.id)], workspaceId: context.workspace.id,
    project: { workspaceId: context.workspace.id } };
}
async function ownedAgent(db: DB, context: InboxContext, agent: string) {
  const row = await db.agentRegistration.findFirst({ where: { workspaceId: context.workspace.id, userId: context.user.id, name: agent } });
  if (!row) throw new HandoffError('agent_not_found', 'Register this agent with your own login first', 404);
  return row;
}
function recipients(agent: Agent): Prisma.AgentHandoffWhereInput {
  return { OR: [{ recipientNames: { has: agent.name } }, { labelIds: { hasSome: agent.labelIds } },
    { senderId: agent.id }, { claimedById: agent.id }] };
}
async function visibleHandoff(db: DB, context: AppAuthContext, agent: Agent, handoffId: string) {
  const row = await db.agentHandoff.findFirst({ where: { id: handoffId, workspaceId: context.workspace.id,
    AND: [recipients(agent)], issue: issueScope(context) }, include: { issue: { select: { id: true, issueKey: true, title: true, projectId: true } } } });
  if (!row) throw new HandoffError('handoff_not_found', 'Handoff not found or access denied', 404);
  return row;
}
async function validLabels(db: DB, workspaceId: string, labelIds: string[]) {
  const unique = [...new Set(labelIds)];
  const count = await db.taskLabel.count({ where: { id: { in: unique }, workspaceId } });
  if (count !== unique.length) throw new HandoffError('invalid_labels', 'Labels must belong to this workspace');
  return unique;
}
async function activity(db: DB, context: AppAuthContext, agent: Agent, issue: { id: string; projectId: string },
  handoffId: string, action: string, content?: string, extra = {}) {
  await db.issueActivity.create({ data: { itemType: 'ISSUE', itemId: issue.id, workspaceId: context.workspace.id,
    projectId: issue.projectId, userId: context.user.id, action: `AGENT_${action.toUpperCase()}`,
    details: JSON.stringify({ agent: { id: agent.id, name: agent.name }, handoffId, content, ...extra }) } });
}

// Hold the rows used by issueReadAccessWhere until a transfer mutation commits.
async function lockTransferAccess(db: Prisma.TransactionClient, workspaceId: string, issueId: string, firstUser: string, secondUser: string) {
  await db.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR SHARE`;
  await db.$queryRaw`SELECT id FROM "WorkspaceMember" WHERE "workspaceId" = ${workspaceId} AND "userId" IN (${firstUser}, ${secondUser}) ORDER BY id FOR SHARE`;
  await db.$queryRaw`SELECT id FROM "Issue" WHERE id = ${issueId} AND "workspaceId" = ${workspaceId} FOR SHARE`;
  await db.$queryRaw`SELECT p.id FROM "Project" p WHERE p.id IN (
    SELECT i."projectId" FROM "Issue" i WHERE i.id = ${issueId} AND i."workspaceId" = ${workspaceId}
    UNION SELECT s."projectId" FROM "ProjectStatus" s JOIN "Issue" i ON i."statusId" = s.id WHERE i.id = ${issueId} AND i."workspaceId" = ${workspaceId}
  ) ORDER BY p.id FOR SHARE`;
  await db.$queryRaw`SELECT s.id FROM "ProjectStatus" s JOIN "Issue" i ON i."statusId" = s.id WHERE i.id = ${issueId} AND i."workspaceId" = ${workspaceId} FOR SHARE OF s`;
}

export async function registerAgent(context: AppAuthContext, input: z.infer<typeof registrationSchema>) {
  try { return await prisma.$transaction(async db => {
    const labelIds = await validLabels(db, context.workspace.id, input.labelIds);
    await db.$queryRaw`SELECT id FROM "AgentRegistration" WHERE "workspaceId" = ${context.workspace.id} AND name = ${input.name} FOR UPDATE`;
    const existing = await db.agentRegistration.findUnique({ where: { workspaceId_name: { workspaceId: context.workspace.id, name: input.name } } });
    if (existing && existing.userId !== context.user.id) throw new HandoffError('agent_name_taken', 'This agent name belongs to another user', 409);
    if (existing?.managedWorker) throw new HandoffError('managed_agent', 'Use worker setup; managed identity cannot be changed by legacy registration', 409);
    const changed = input.host && (existing?.host !== input.host || existing?.sessionId !== input.sessionId);
    if (changed && existing && watcherState(existing.watcher)?.state === 'running') {
      throw new HandoffError('watcher_active', 'Stop the current watcher before rebinding this agent session', 409);
    }
    const data = { labelIds, ...(input.host && { host: input.host, sessionId: input.sessionId }), ...(changed && { watcher: {} }) };
    const agent = existing
      ? await db.agentRegistration.update({ where: { id: existing.id }, data })
      : await db.agentRegistration.create({ data: { workspaceId: context.workspace.id, userId: context.user.id, name: input.name, ...data } });
    return agent.host ? agentStatus(agent) : { id: agent.id, workspaceId: agent.workspaceId, userId: agent.userId,
      name: agent.name, labelIds: agent.labelIds, createdAt: agent.createdAt, updatedAt: agent.updatedAt };
  }); }
  catch (error) {
    if ((error as { code?: string }).code === 'P2002') throw new HandoffError('agent_identity_conflict', 'This name or host/session already has a registration. Reuse its current agent name.', 409);
    throw error;
  }
}
export async function listAgents(context: AppAuthContext) {
  const agents = await prisma.agentRegistration.findMany({ where: { workspaceId: context.workspace.id }, orderBy: { name: 'asc' }, take: 200 });
  return agents.map(agentStatus);
}
export async function getOwnedAgent(context: AppAuthContext, agent: unknown) {
  if (!hasScope('issues:read', context.token.scopes)) throw new HandoffError('insufficient_scope', 'Agent lookup requires issues:read', 403);
  return agentStatus(await ownedAgent(prisma, context, name.parse(agent)));
}

export async function reportWatcher(context: AppAuthContext, input: z.infer<typeof heartbeatSchema>) {
  return prisma.$transaction(async db => {
    await db.$queryRaw`SELECT id FROM "AgentRegistration" WHERE "workspaceId" = ${context.workspace.id} AND name = ${input.agent} FOR UPDATE`;
    const agent = await ownedAgent(db, context, input.agent);
    if (agent.host !== input.host || agent.sessionId !== input.sessionId) {
      throw new HandoffError('agent_session_mismatch', 'Register this exact host/session binding before reporting watcher health', 409);
    }
    const prior = watcherState(agent.watcher);
    if (agent.managedWorker) throw new HandoffError('managed_agent', 'Use managed worker health for this agent', 409);
    if (input.event === 'started') {
      if (prior?.id !== input.watcherId && prior?.state === 'running') throw new HandoffError('watcher_active', 'Another watcher is active for this agent', 409);
    } else if (!prior || prior.id !== input.watcherId || !['running', 'stale'].includes(prior.state)) {
      throw new HandoffError('watcher_changed', 'The watcher binding changed or ended. Stop this watcher.', 409);
    }
    const now = new Date().toISOString();
    const watcher: Watcher = { id: input.watcherId, startedAt: prior?.id === input.watcherId ? prior.startedAt : now,
      heartbeatAt: now, state: input.event === 'error' ? 'error' : input.event === 'stopped' ? 'stopped' : 'running',
      lastPollAt: input.event === 'poll' ? now : prior?.lastPollAt ?? null,
      lastWakeAt: input.event === 'wake' ? now : prior?.lastWakeAt ?? null, errorCode: input.errorCode ?? null };
    await db.agentRegistration.update({ where: { id: agent.id }, data: { watcher } });
    return { agent: agent.name, host: agent.host, sessionId: agent.sessionId, watcher };
  });
}

export async function sendHandoff(context: AppAuthContext, input: z.infer<typeof sendSchema>) {
  return prisma.$transaction(async db => {
    await db.$queryRaw`SELECT id FROM "AgentRegistration" WHERE "workspaceId" = ${context.workspace.id} AND name = ${input.agent} FOR UPDATE`;
    const agent = await ownedAgent(db, context, input.agent);
    assertManagedGeneration(agent.managedWorker, input.generation);
    const sourceKey = `manual:${agent.id}:${input.requestId || randomUUID()}`;
    const issue = await db.issue.findFirst({ where: { AND: [issueScope(context), { OR: [{ id: input.issue }, { issueKey: input.issue }] }] }, select: { id: true, projectId: true } });
    if (!issue) throw new HandoffError('issue_not_found', 'Issue not found or access denied', 404);
    const labelIds = await validLabels(db, context.workspace.id, input.toLabels);
    const recipientNames = [...new Set(input.toAgents)];
    if (await db.agentRegistration.count({ where: { workspaceId: context.workspace.id, name: { in: recipientNames } } }) !== recipientNames.length) {
      throw new HandoffError('recipient_not_found', 'Register named recipients before sending a handoff', 404);
    }
    const existing = await db.agentHandoff.findUnique({ where: { workspaceId_sourceKey: { workspaceId: context.workspace.id, sourceKey } } });
    if (existing) {
      if (existing.issueId !== issue.id || existing.content !== input.content || existing.afterId !== (input.afterId || null) ||
        existing.requestAck !== input.requestAck || JSON.stringify(existing.recipientNames) !== JSON.stringify(recipientNames) || JSON.stringify(existing.labelIds) !== JSON.stringify(labelIds)) {
        throw new HandoffError('request_conflict', 'This requestId was already used for different content', 409);
      }
      return existing;
    }
    if (input.afterId) {
      const prior = await visibleHandoff(db, context, agent, input.afterId);
      if (prior.issueId !== issue.id) throw new HandoffError('invalid_chain', 'A handoff chain must stay on the same issue');
      if (prior.status === 'claimed' && prior.claimedById === agent.id) {
        await db.$queryRaw`SELECT id FROM "AgentHandoff" WHERE id = ${prior.id} AND "workspaceId" = ${context.workspace.id} AND "claimedById" = ${agent.id} FOR UPDATE`;
        if (await db.agentTransferOffer.findFirst({ where: { parentId: prior.id, status: 'pending' }, select: { id: true } })) {
          throw new HandoffError('transfer_offer_pending', 'Accept or cancel the pending transfer offer before changing this claim', 409);
        }
      }
      const released = await db.agentHandoff.updateMany({ where: { id: prior.id, status: 'claimed', claimedById: agent.id }, data: { status: 'completed' } });
      if (!released.count) throw new HandoffError('claim_required', 'Claim the previous handoff before passing it on', 409);
      await activity(db, context, agent, issue, prior.id, 'passed', input.content, { toAgents: recipientNames, toLabels: labelIds });
    }
    const handoff = await db.agentHandoff.create({ data: { workspaceId: context.workspace.id, issueId: issue.id, sourceKey,
      senderId: agent.id, content: input.content, recipientNames, labelIds, requestAck: input.requestAck, afterId: input.afterId } });
    await activity(db, context, agent, issue, handoff.id, 'sent', input.content, { toAgents: recipientNames, toLabels: labelIds, afterId: input.afterId });
    return handoff;
  });
}

// An offer is intentionally separate from the legacy worker inbox. The sender
// keeps its claim until the named manual recipient accepts.
export async function createTransferOffer(context: AppAuthContext, input: z.infer<typeof transferOfferSchema>) {
  if (!['issues:read', 'issues:write'].every(scope => hasScope(scope, context.token.scopes))) throw new HandoffError('insufficient_scope', 'Transfer offers require issues:read and issues:write', 403);
  return prisma.$transaction(async db => {
    let sender = await ownedAgent(db, context, input.agent);
    const prior = await visibleHandoff(db, context, sender, input.handoffId);
    const retry = await db.agentTransferOffer.findUnique({ where: { workspaceId_senderId_requestId: {
      workspaceId: context.workspace.id, senderId: sender.id, requestId: input.requestId,
    } } });
    if (retry) {
      if (retry.parentId !== prior.id || retry.recipientName !== input.toAgent || retry.content !== input.content) {
        throw new HandoffError('request_conflict', 'This requestId was already used for a different offer', 409);
      }
      return retry;
    }
    if (prior.status !== 'claimed' || prior.claimedById !== sender.id) throw new HandoffError('claim_required', 'Only the current owner can offer this work', 409);
    let recipient = await db.agentRegistration.findFirst({ where: { workspaceId: context.workspace.id, name: input.toAgent } });
    if (!recipient || recipient.id === sender.id || recipient.managedWorker) throw new HandoffError('recipient_not_found', 'A different registered manual agent is required', 404);
    if (!await db.issue.findFirst({ where: { id: prior.issueId,
      ...issueScope({ user: { id: recipient.userId }, workspace: context.workspace }) }, select: { id: true } })) {
      throw new HandoffError('recipient_not_found', 'Recipient cannot access this issue', 404);
    }
    const senderId = sender.id, recipientId = recipient.id;
    // Both registrations precede the handoff lock, in a stable order, to avoid
    // a create/accept deadlock on the successor's sender foreign key.
    await db.$queryRaw`SELECT id FROM "AgentRegistration" WHERE "workspaceId" = ${context.workspace.id} AND id IN (${sender.id}, ${recipient.id}) ORDER BY id FOR UPDATE`;
    sender = await ownedAgent(db, context, input.agent);
    recipient = await db.agentRegistration.findFirst({ where: { workspaceId: context.workspace.id, name: input.toAgent } });
    if (sender.id !== senderId || sender.managedWorker) throw new HandoffError('managed_agent', 'Transfer offers require the same manual agent', 409);
    if (!recipient || recipient.id !== recipientId || recipient.id === sender.id || recipient.managedWorker) throw new HandoffError('recipient_not_found', 'A different registered manual agent is required', 404);
    await lockTransferAccess(db, context.workspace.id, prior.issueId, sender.userId, recipient.userId);
    const existing = await db.agentTransferOffer.findUnique({ where: { workspaceId_senderId_requestId: {
      workspaceId: context.workspace.id, senderId: sender.id, requestId: input.requestId,
    } } });
    if (existing) {
      if (existing.parentId !== prior.id || existing.recipientName !== input.toAgent || existing.content !== input.content) {
        throw new HandoffError('request_conflict', 'This requestId was already used for a different offer', 409);
      }
      return existing;
    }
    await db.$queryRaw`SELECT id FROM "AgentHandoff" WHERE id = ${prior.id} AND "workspaceId" = ${context.workspace.id} AND "claimedById" = ${sender.id} FOR UPDATE`;
    const current = await visibleHandoff(db, context, sender, prior.id);
    if (current.status !== 'claimed' || current.claimedById !== sender.id) throw new HandoffError('claim_required', 'Only the current owner can offer this work', 409);
    const recipientIssue = await db.issue.findFirst({ where: { id: current.issueId,
      ...issueScope({ user: { id: recipient.userId }, workspace: context.workspace }) }, select: { id: true } });
    if (!recipientIssue) throw new HandoffError('recipient_not_found', 'Recipient cannot access this issue', 404);
    if (await db.agentTransferOffer.findFirst({ where: { parentId: current.id, status: 'pending' } })) {
      throw new HandoffError('offer_pending', 'Cancel the existing offer before sending another', 409);
    }
    const offer = await db.agentTransferOffer.create({ data: { workspaceId: context.workspace.id, issueId: current.issueId,
      parentId: current.id, senderId: sender.id, recipientId: recipient.id, recipientName: recipient.name, requestId: input.requestId, content: input.content } });
    await activity(db, context, sender, current.issue, current.id, 'transfer_offered', undefined, { offerId: offer.id, recipient: recipient.name });
    return offer;
  });
}

export async function listTransferOffers(context: AppAuthContext, query: z.infer<typeof transferOfferListSchema>) {
  const agent = await ownedAgent(prisma, context, query.agent);
  const owner = await prisma.workspace.findFirst({ where: { id: context.workspace.id, ownerId: context.user.id }, select: { id: true } });
  let position: { createdAt: Date; id: string } | undefined;
  if (query.cursor) {
    try {
      const bytes = Buffer.from(query.cursor, 'base64url');
      if (bytes.toString('base64url') !== query.cursor) throw new Error();
      const [workspaceId, agentId, timestamp, offerId] = z.tuple([id, id, z.string().datetime(), id]).parse(JSON.parse(bytes.toString('utf8')));
      const createdAt = new Date(timestamp);
      if (workspaceId !== context.workspace.id || agentId !== agent.id || createdAt.toISOString() !== timestamp) throw new Error();
      position = { createdAt, id: offerId };
    } catch { throw new HandoffError('invalid_cursor', 'Invalid offer cursor'); }
  }
  const rows = await prisma.agentTransferOffer.findMany({ where: { workspaceId: context.workspace.id, status: 'pending',
    ...(!owner && { OR: [{ senderId: agent.id }, { recipientId: agent.id }] }), issue: issueScope(context), ...(position && { AND: [{ OR: [
      { createdAt: { gt: position.createdAt } }, { createdAt: position.createdAt, id: { gt: position.id } },
    ] }] }) }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: query.limit + 1,
    include: { issue: { select: { issueKey: true, title: true } }, sender: { select: { name: true } }, recipient: { select: { name: true } } } });
  const items = rows.slice(0, query.limit);
  const last = items.at(-1);
  const hasMore = rows.length > query.limit;
  const nextCursor = hasMore && last ? Buffer.from(JSON.stringify([context.workspace.id, agent.id, last.createdAt.toISOString(), last.id])).toString('base64url') : null;
  return { items, hasMore, nextCursor };
}

export async function actOnTransferOffer(context: AppAuthContext, offerId: string, input: z.infer<typeof transferOfferActionSchema>) {
  if (!['issues:read', 'issues:write'].every(scope => hasScope(scope, context.token.scopes))) throw new HandoffError('insufficient_scope', 'Transfer offers require issues:read and issues:write', 403);
  return prisma.$transaction(async db => {
    let agent = await ownedAgent(db, context, input.agent);
    const owner = input.action === 'cancel' && await db.workspace.findFirst({ where: { id: context.workspace.id, ownerId: context.user.id }, select: { id: true } });
    // The preliminary read is scoped; both records are locked in parent/offer order and re-read.
    const where = { id: offerId, workspaceId: context.workspace.id,
      ...(input.action === 'accept' ? { recipientId: agent.id } : !owner ? { OR: [{ senderId: agent.id }, { recipientId: agent.id }] } : {}), issue: issueScope(context) };
    const actorId = agent.id;
    const initial = await db.agentTransferOffer.findFirst({ where });
    if (!initial) throw new HandoffError('offer_not_found', 'Offer not found or access denied', 404);
    await db.$queryRaw`SELECT id FROM "AgentRegistration" WHERE "workspaceId" = ${context.workspace.id} AND id IN (${agent.id}, ${initial.senderId ?? agent.id}) ORDER BY id FOR UPDATE`;
    agent = await ownedAgent(db, context, input.agent);
    if (agent.id !== actorId || agent.managedWorker) throw new HandoffError('managed_agent', 'Transfer offers require the same manual agent', 409);
    const originalSender = initial.senderId ? await db.agentRegistration.findFirst({ where: { id: initial.senderId, workspaceId: context.workspace.id } }) : null;
    await lockTransferAccess(db, context.workspace.id, initial.issueId, agent.userId, originalSender?.userId ?? agent.userId);
    await db.$queryRaw`SELECT id FROM "AgentHandoff" WHERE id = ${initial.parentId} AND "workspaceId" = ${context.workspace.id} FOR UPDATE`;
    await db.$queryRaw`SELECT id FROM "AgentTransferOffer" WHERE id = ${offerId} AND "workspaceId" = ${context.workspace.id} FOR UPDATE`;
    const offer = await db.agentTransferOffer.findFirst({ where, include: { issue: { select: { id: true, issueKey: true, title: true, projectId: true } } } });
    if (!offer) throw new HandoffError('offer_not_found', 'Offer not found or access denied', 404);
    if (input.action === 'cancel') {
      if (offer.senderId !== agent.id && offer.recipientId !== agent.id && !await db.workspace.findFirst({
        where: { id: context.workspace.id, ownerId: context.user.id }, select: { id: true },
      })) throw new HandoffError('offer_not_found', 'Offer not found or access denied', 404);
      if (offer.status === 'cancelled') return offer;
      if (offer.status !== 'pending') throw new HandoffError('offer_closed', 'The offer is no longer pending', 409);
      const result = await db.agentTransferOffer.update({ where: { id: offer.id }, data: { status: 'cancelled' } });
      await activity(db, context, agent, offer.issue, offer.parentId, 'transfer_cancelled', undefined, { offerId: offer.id });
      return result;
    }
    if (offer.status === 'accepted') {
      if (!offer.acceptedHandoffId) throw new HandoffError('offer_closed', 'Accepted handoff is unavailable', 409);
      return { offer, handoff: await visibleHandoff(db, context, agent, offer.acceptedHandoffId) };
    }
    if (offer.status !== 'pending' || !offer.senderId) throw new HandoffError('offer_closed', 'The offer is no longer pending', 409);
    const sender = await db.agentRegistration.findFirst({ where: { id: offer.senderId, workspaceId: context.workspace.id } });
    if (!sender || sender.managedWorker) throw new HandoffError('offer_closed', 'Original owner is unavailable', 409);
    const senderIssue = await db.issue.findFirst({ where: { id: offer.issueId,
      ...issueScope({ user: { id: sender.userId }, workspace: context.workspace }) }, select: { id: true } });
    if (!senderIssue) throw new HandoffError('offer_closed', 'Original owner cannot access this issue', 409);
    // The database guard also protects against older servers releasing the parent.
    // Mark acceptance before closing the parent; both writes commit or roll back together.
    await db.agentTransferOffer.update({ where: { id: offer.id }, data: { status: 'accepted' } });
    const changed = await db.agentHandoff.updateMany({ where: { id: offer.parentId, workspaceId: context.workspace.id,
      issueId: offer.issueId, status: 'claimed', claimedById: sender.id }, data: { status: 'completed' } });
    if (!changed.count) throw new HandoffError('claim_changed', 'Original ownership changed; create a new offer', 409);
    const handoff = await db.agentHandoff.create({ data: { workspaceId: context.workspace.id, issueId: offer.issueId,
      sourceKey: `transfer-offer:${offer.id}`, senderId: sender.id, claimedById: agent.id, status: 'claimed',
      recipientNames: [agent.name], content: offer.content, afterId: offer.parentId } });
    const accepted = await db.agentTransferOffer.update({ where: { id: offer.id }, data: { acceptedHandoffId: handoff.id } });
    await activity(db, context, agent, offer.issue, offer.parentId, 'transfer_accepted', undefined, { offerId: offer.id, successorId: handoff.id });
    await activity(db, context, agent, offer.issue, handoff.id, 'claim', undefined, { offerId: offer.id });
    return { offer: accepted, handoff };
  });
}

function inboxMatch(agent: Agent, state: 'unseen' | 'claimed'): Prisma.AgentHandoffWhereInput {
  return {
    OR: [{ recipientNames: { has: agent.name } }, { labelIds: { hasSome: agent.labelIds } }, { claimedById: agent.id }],
    ...(state === 'claimed' ? { claimedById: agent.id, status: 'claimed' }
      : { status: { not: 'superseded' }, receipts: { none: { agentId: agent.id, seenAt: { not: null } } } }),
  };
}

const inboxCursorSchema = z.tuple([id, id, z.enum(['unseen', 'claimed']), z.string().datetime(), id]);

async function readInbox(context: InboxContext, matches: Prisma.AgentHandoffWhereInput[], limit: number,
  position?: { createdAt: Date; id: string }) {
  const items = await prisma.agentHandoff.findMany({ where: { workspaceId: context.workspace.id,
    issue: issueScope(context), OR: matches, ...(position && { AND: [{ OR: [
      { createdAt: { gt: position.createdAt } }, { createdAt: position.createdAt, id: { gt: position.id } },
    ] }] }),
  }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: limit + 1,
  include: { issue: { select: { id: true, issueKey: true, title: true, projectId: true } },
    claimedBy: { select: { name: true } }, sender: { select: { name: true } } } });
  return { items: items.slice(0, limit), hasMore: items.length > limit };
}

export async function agentInbox(context: InboxContext, query: z.infer<typeof inboxSchema>) {
  const agent = await ownedAgent(prisma, context, query.agent);
  let position: { createdAt: Date; id: string } | undefined;
  if (query.cursor) {
    try {
      const bytes = Buffer.from(query.cursor, 'base64url');
      if (bytes.toString('base64url') !== query.cursor) throw new Error();
      const [workspaceId, agentId, state, timestamp, handoffId] = inboxCursorSchema.parse(JSON.parse(bytes.toString('utf8')));
      const createdAt = new Date(timestamp);
      if (workspaceId !== context.workspace.id || agentId !== agent.id || state !== query.state ||
        !Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== timestamp) throw new Error();
      position = { createdAt, id: handoffId };
    } catch { throw new HandoffError('invalid_cursor', 'Invalid inbox cursor'); }
  }
  const inbox = await readInbox(context, [inboxMatch(agent, query.state)], query.limit, position);
  const last = inbox.items.at(-1);
  const nextCursor = inbox.hasMore && last ? Buffer.from(JSON.stringify([
    context.workspace.id, agent.id, query.state, last.createdAt.toISOString(), last.id,
  ])).toString('base64url') : null;
  return { ...inbox, nextCursor, agent: agent.name };
}

/** Read-only workspace monitoring; CLI ownership and mutation rules stay unchanged. */
export async function workspaceAgentInbox(context: InboxContext, query: { agent?: string; state: 'unseen' | 'claimed'; limit: number }) {
  const agents = await prisma.agentRegistration.findMany({ where: { workspaceId: context.workspace.id },
    orderBy: { name: 'asc' } });
  const selected = query.agent ? agents.filter(agent => agent.name === query.agent) : agents;
  if (query.agent && selected.length === 0) throw new HandoffError('agent_not_found', 'Agent not found in this workspace', 404);
  // Both the viewer and the recipient must still be allowed to read the issue.
  // One OR query returns each handoff once, even when multiple agents receive it.
  const inbox = await readInbox(context, selected.map(agent => ({
    ...inboxMatch(agent, query.state), issue: issueScope({ ...context, user: { id: agent.userId } }),
  })), Math.min(50, Math.max(1, query.limit)));
  return { ...inbox, agents: agents.map(agent => ({ name: agent.name, ...(agent.host && agentStatus(agent)) })) };
}

export async function getHandoff(context: AppAuthContext, agentName: string, id: string) {
  const agent = await ownedAgent(prisma, context, agentName);
  const handoff = await visibleHandoff(prisma, context, agent, id);
  return { handoff, context: { issue: handoff.issue, commands: [
    `collab issues get ${handoff.issue.id} --workspace ${context.workspace.id}`, `collab comments list ${handoff.issue.id} --workspace ${context.workspace.id}`,
    `collab issues activity ${handoff.issue.id} --workspace ${context.workspace.id}`, `collab context get --project ${handoff.issue.projectId} --workspace ${context.workspace.id}`,
  ] } };
}

export async function actOnHandoff(context: AppAuthContext, id: string, input: z.infer<typeof actionSchema>) {
  if (!['seen', 'ack'].includes(input.action) && !hasScope('issues:write', context.token.scopes)) {
    throw new HandoffError('insufficient_scope', 'This action requires issues:write', 403);
  }
  return prisma.$transaction(async db => {
    const lease = input.coordinator && input.action === 'claim' ? await coordinatorAdmission(db, context, input.coordinator) : null;
    await db.$queryRaw`SELECT id FROM "AgentRegistration" WHERE "workspaceId" = ${context.workspace.id} AND name = ${input.agent} FOR UPDATE`;
    const agent = await ownedAgent(db, context, input.agent);
    assertManagedGeneration(agent.managedWorker, input.generation);
    const managed = agent.managedWorker as unknown as ManagedWorker | null;
    if (input.action === 'claim' && managed?.coordinator) {
      if (!lease || input.coordinator?.project !== managed.coordinator.project || input.coordinator.generation !== managed.coordinator.generation || lease.worker?.id !== agent.id || lease.worker.generation !== input.generation) throw new HandoffError('coordinator_fenced', 'Coordinator worker admission is required', 409);
    } else if (lease) throw new HandoffError('coordinator_fenced', 'Coordinator worker admission is required', 409);
    if (input.action === 'supersede') {
      // Lock both ends in a stable order so concurrent replacements cannot create a cycle.
      await db.$queryRaw`SELECT id FROM "AgentHandoff" WHERE id IN (${id}, ${input.replacementId}) ORDER BY id FOR UPDATE`;
    }
    if (lease) await db.$queryRaw`SELECT id FROM "AgentHandoff" WHERE id = ${id} FOR UPDATE`;
    const handoff = await visibleHandoff(db, context, agent, id);
    if (['complete', 'release', 'supersede'].includes(input.action) && handoff.status === 'claimed' && handoff.claimedById === agent.id) {
      await db.$queryRaw`SELECT id FROM "AgentHandoff" WHERE id = ${id} AND "workspaceId" = ${context.workspace.id} AND "claimedById" = ${agent.id} FOR UPDATE`;
      if (await db.agentTransferOffer.findFirst({ where: { parentId: id, status: 'pending' }, select: { id: true } })) {
        throw new HandoffError('transfer_offer_pending', 'Accept or cancel the pending transfer offer before changing this claim', 409);
      }
    }
    if (input.action === 'supersede') {
      if (handoff.status === 'superseded' && handoff.supersededById === input.replacementId) return handoff;
      const replacement = await visibleHandoff(db, context, agent, input.replacementId!);
      if (replacement.id === id || replacement.issueId !== handoff.issueId || !['open', 'claimed', 'completed'].includes(replacement.status)) {
        throw new HandoffError('invalid_replacement', 'Replacement must be another open, claimed or completed handoff on the same issue');
      }
      const changed = await db.agentHandoff.updateMany({ where: { id, OR: [
        { status: 'open', senderId: agent.id, claimedById: null }, { status: 'claimed', claimedById: agent.id },
      ] }, data: { status: 'superseded' } });
      if (!changed.count) throw new HandoffError('supersede_conflict', 'Only the sender of open work or its current claimant can supersede it', 409);
      await db.agentHandoff.update({ where: { id }, data: { supersededBy: { connect: { id: replacement.id } } } });
      await activity(db, context, agent, handoff.issue, id, 'superseded', input.content, { replacementId: replacement.id });
      return db.agentHandoff.findUniqueOrThrow({ where: { id } });
    }
    if (input.action === 'seen' || input.action === 'ack') {
      const data = { seenAt: new Date() };
      await db.agentReceipt.upsert({ where: { handoffId_agentId: { handoffId: id, agentId: agent.id } },
        create: { handoffId: id, agentId: agent.id, ...data }, update: data });
      if (input.action === 'ack') {
        const acknowledged = await db.agentReceipt.updateMany({ where: { handoffId: id, agentId: agent.id, ackAt: null }, data: { ackAt: new Date() } });
        if (acknowledged.count) await activity(db, context, agent, handoff.issue, id, 'acknowledged');
      }
      return { id, action: input.action, status: handoff.status };
    }
    if (input.action === 'claim') {
      if (handoff.claimedById === agent.id && handoff.status === 'claimed') return handoff;
      if (!handoff.recipientNames.includes(agent.name) && !handoff.labelIds.some(label => agent.labelIds.includes(label))) {
        throw new HandoffError('not_a_recipient', 'Only a matching recipient can claim this handoff', 403);
      }
      if (lease && handoff.status !== 'open') throw new HandoffError('already_claimed', 'Another agent claimed or completed this work', 409);
      if (lease && (handoff.issue.projectId !== input.coordinator!.project || await wasClaimed(db, context.workspace.id, handoff.issueId, id))) throw new HandoffError('coordinator_fenced', 'Previously claimed work cannot be automatically reassigned', 409);
      const claimed = await db.agentHandoff.updateMany({ where: { id, status: 'open', claimedById: null }, data: { status: 'claimed', claimedById: agent.id } });
      if (!claimed.count) throw new HandoffError('already_claimed', 'Another agent claimed or completed this work', 409);
    } else {
      const changed = await db.agentHandoff.updateMany({ where: { id, status: 'claimed', claimedById: agent.id },
        data: input.action === 'release' ? { status: 'open', claimedById: null } : input.action === 'complete' ? { status: 'completed' } : { updatedAt: new Date() } });
      if (!changed.count) throw new HandoffError('claim_required', 'Only the current claimant may update this work', 409);
      // Releasing work makes it visible to subscribers who previously saw it.
      if (input.action === 'release') await db.agentReceipt.deleteMany({ where: { handoffId: id } });
    }
    await activity(db, context, agent, handoff.issue, id, input.action, input.content);
    return db.agentHandoff.findUniqueOrThrow({ where: { id } });
  });
}
