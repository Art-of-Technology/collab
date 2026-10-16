import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { AppAuthContext } from '@/lib/apps/auth-middleware';
import { issueReadAccessWhere } from '@/lib/issue-finder';
import { hasScope } from '@/lib/oauth-scopes';

const name = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const id = z.string().min(1).max(128);
const text = z.string().trim().min(1).max(16000);
export const registrationSchema = z.object({ name, labelIds: z.array(id).max(32).default([]) }).strict();
export const sendSchema = z.object({ agent: name, issue: id, content: text,
  toAgents: z.array(name).max(32).default([]), toLabels: z.array(id).max(32).default([]),
  requestAck: z.boolean().default(false), requestId: z.string().uuid().optional(), afterId: id.optional(),
}).strict().refine(v => v.toAgents.length + v.toLabels.length > 0, 'Supply at least one recipient or label');
export const actionSchema = z.object({ agent: name, action: z.enum(['seen', 'ack', 'claim', 'progress', 'release', 'complete']),
  content: text.optional(),
}).strict().refine(v => !['progress', 'release', 'complete'].includes(v.action) || Boolean(v.content), 'This action requires content');
export const inboxSchema = z.object({ agent: name, limit: z.coerce.number().int().min(1).max(50).default(20),
  state: z.enum(['unseen', 'claimed', 'all']).default('unseen'),
}).strict();

export class HandoffError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
type DB = Prisma.TransactionClient | typeof prisma;
type Agent = { id: string; name: string; userId: string; labelIds: string[] };
function issueScope(context: AppAuthContext): Prisma.IssueWhereInput {
  return { AND: [issueReadAccessWhere(context.user.id)], workspaceId: context.workspace.id,
    project: { workspaceId: context.workspace.id } };
}
async function ownedAgent(db: DB, context: AppAuthContext, agent: string) {
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

export async function registerAgent(context: AppAuthContext, input: z.infer<typeof registrationSchema>) {
  const labelIds = await validLabels(prisma, context.workspace.id, input.labelIds);
  const key = { workspaceId_name: { workspaceId: context.workspace.id, name: input.name } };
  const existing = await prisma.agentRegistration.findUnique({ where: key });
  if (existing && existing.userId !== context.user.id) throw new HandoffError('agent_name_taken', 'This agent name belongs to another user', 409);
  if (existing) return prisma.agentRegistration.update({ where: { id: existing.id }, data: { labelIds } });
  try { return await prisma.agentRegistration.create({ data: { workspaceId: context.workspace.id, userId: context.user.id, name: input.name, labelIds } }); }
  catch (error) {
    if ((error as { code?: string }).code === 'P2002') throw new HandoffError('agent_name_taken', 'Agent registration changed; retry with your own name', 409);
    throw error;
  }
}
export async function listAgents(context: AppAuthContext) {
  return prisma.agentRegistration.findMany({ where: { workspaceId: context.workspace.id },
    select: { id: true, name: true, labelIds: true }, orderBy: { name: 'asc' }, take: 200 });
}

export async function sendHandoff(context: AppAuthContext, input: z.infer<typeof sendSchema>) {
  const agent = await ownedAgent(prisma, context, input.agent);
  const sourceKey = `manual:${agent.id}:${input.requestId || randomUUID()}`;
  return prisma.$transaction(async db => {
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

export async function agentInbox(context: AppAuthContext, query: z.infer<typeof inboxSchema>) {
  const agent = await ownedAgent(prisma, context, query.agent);
  const items = await prisma.agentHandoff.findMany({ where: { workspaceId: context.workspace.id, issue: issueScope(context),
    AND: [{ OR: [{ recipientNames: { has: agent.name } }, { labelIds: { hasSome: agent.labelIds } }, { claimedById: agent.id }] }],
    ...(query.state === 'unseen' && { receipts: { none: { agentId: agent.id, seenAt: { not: null } } } }),
    ...(query.state === 'claimed' && { claimedById: agent.id, status: 'claimed' }),
  }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: query.limit + 1,
  include: { issue: { select: { id: true, issueKey: true, title: true, projectId: true } },
    claimedBy: { select: { name: true } }, sender: { select: { name: true } } } });
  return { items: items.slice(0, query.limit), hasMore: items.length > query.limit, agent: agent.name };
}

export async function getHandoff(context: AppAuthContext, agentName: string, id: string) {
  const agent = await ownedAgent(prisma, context, agentName);
  const handoff = await visibleHandoff(prisma, context, agent, id);
  return { handoff, context: { issue: handoff.issue, commands: [
    `collab issues get ${handoff.issue.id}`, `collab comments list ${handoff.issue.id}`,
    `collab issues activity ${handoff.issue.id}`, `collab context get --project ${handoff.issue.projectId}`,
  ] } };
}

export async function actOnHandoff(context: AppAuthContext, id: string, input: z.infer<typeof actionSchema>) {
  if (!['seen', 'ack'].includes(input.action) && !hasScope('issues:write', context.token.scopes)) {
    throw new HandoffError('insufficient_scope', 'This action requires issues:write', 403);
  }
  return prisma.$transaction(async db => {
    const agent = await ownedAgent(db, context, input.agent);
    const handoff = await visibleHandoff(db, context, agent, id);
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
