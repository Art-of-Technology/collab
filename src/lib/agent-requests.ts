import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { DEFAULT_STATUS_ORDER } from '@/constants/project-statuses';
import { NOT_DONE } from '@/lib/agent-runs';
import { ASSIGN_CAP, countSeatHandoff, HandoffError, requireSeat, seatHandoffCapReached, seatWriteGuard } from '@/lib/agent-seats';
import { AGENT_APP_SLUG } from '@/lib/agent-tokens';
import type { AppAuthContext } from '@/lib/apps/auth-middleware';
import { emitIssueCreated } from '@/lib/event-bus';
import { assertLegacyIssueWriteAllowed, assertLegacyProjectWriteAllowed, ForgeProjectWriteError } from '@/lib/forge/legacy-write-guard';
import { assertAssignable } from '@/lib/issue-assignee';
import { allocateIssueKey } from '@/lib/issue-key-allocation';
import { createRefusal, issueShape } from '@/lib/issue-template-enforcement';
import { getWorkspaceTemplates } from '@/lib/issue-template-store';

/** Open requests one project may have in another. */
export const REQUEST_CAP = 5;
/** A release seat that has not read its inbox for this long is taken to be away. */
const IDLE_MS = 10 * 60_000;
/** Per request role: the seat role that takes it, and the label people know it by. */
const REQUESTS = {
  developer: { seat: 'developer', label: null },
  review: { seat: 'reviewer', label: 'Review request' },
  release: { seat: 'release', label: 'Release request' },
  security: { seat: 'security', label: null },
} as const;
type RequestRole = keyof typeof REQUESTS;

const text = (max: number) => z.string().trim().min(1).max(max);
export const requestSchema = z.object({
  project: text(128).optional(), role: z.enum(['developer', 'review', 'release', 'security']), title: text(200), body: text(32_000),
  fromIssue: text(128), blocks: z.boolean().optional(),
}).strict();

/**
 * Rule 8: a seat asks a seat of a role for work on one of its project's issues. The request is a new Task in the target
 * project (the seat's own when none is named, which is how review and release are asked for), its body held to the
 * workspace's issue template, reported by the asking seat, assigned to the target project's default seat for the role,
 * and linked to the issue it came from: it blocks that issue when `blocks`, else it relates to it. A security request
 * always blocks, whatever the caller says, and the reply says so. It takes its source's priority.
 * `agentRequestRole` is what makes it a request; the role's label is added for people to see and hands it to nobody.
 * One project has at most five open requests in another; inside a project there is no cap. A request to a release
 * seat that is away still succeeds, with a warning and a comment that says so.
 */
export async function fileRequest(context: Pick<AppAuthContext, 'user' | 'workspace'>, input: z.infer<typeof requestSchema>) {
  const me = context.user.id, workspaceId = context.workspace.id;
  const seat = await requireSeat(prisma, context);
  const source = await prisma.issue.findFirst({ where: { workspaceId, OR: [{ id: input.fromIssue }, { issueKey: input.fromIssue }] },
    select: { id: true, projectId: true, priority: true } });
  if (!source) throw new HandoffError('not_found', 'Issue not found', 404);
  await seatWriteGuard(prisma, context, source.projectId);
  const target = input.project
    ? await prisma.project.findFirst({ where: { workspaceId, OR: [{ id: input.project }, { issuePrefix: input.project }] }, select: { id: true } })
    : { id: seat.projectId };
  if (!target) throw new HandoffError('project_not_found', 'Project not found in this workspace', 404);
  // As on every other issue write: a Forge-connected project's issues change through its Forge board.
  await Promise.all([assertLegacyProjectWriteAllowed(target.id), assertLegacyIssueWriteAllowed(source.id)]).catch(error => {
    throw error instanceof ForgeProjectWriteError ? new HandoffError('forge_connected_project', error.message, 409) : error;
  });

  const kind = REQUESTS[input.role];
  const label = kind.label ? await prisma.taskLabel.findFirst({ where: { workspaceId, name: kind.label }, select: { id: true } }) : null;
  // Only the body is held to the template. A request's fields are the server's (its source's priority, its role's
  // label, its assignee) and the asking seat can state no other, so a required field could only refuse every request.
  const { enforced, templates } = await getWorkspaceTemplates(workspaceId);
  const sections = { ...templates, TASK: { ...templates.TASK, requiredFields: [] } };
  const made = await prisma.$transaction(async tx => {
    // The lock that creating and retiring a seat take: the target project's seats stay as they are until this ends,
    // and requests into the project are counted and written one at a time.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`agent-seat:${target.id}`}))`;
    await tx.$queryRaw`SELECT "id" FROM "AgentSeat" WHERE "userId" = ${me} FOR SHARE`;
    await tx.$queryRaw`SELECT "id" FROM "Issue" WHERE "id" = ${source.id} FOR UPDATE`;
    const currentSource = await tx.issue.findFirst({ where: { id: source.id, workspaceId }, select: { id: true, issueKey: true, projectId: true, priority: true } });
    if (!currentSource) throw new HandoffError('not_found', 'Issue not found', 404);
    await seatWriteGuard(tx, context, currentSource.projectId);
    const currentSeat = await requireSeat(tx, context);
    if (currentSeat.projectId !== seat.projectId) throw new HandoffError('wrong_project', "A seat writes only to its own project's issues", 403);
    const refusal = enforced && createRefusal(sections, issueShape({ type: 'TASK', description: input.body }));
    if (refusal) throw Object.assign(new HandoffError(refusal.error, refusal.error_description, 422), { body: refusal });
    return writeRequest(tx, { workspaceId, me, projectId: target.id, from: currentSeat.projectId, role: input.role, title: input.title, body: input.body,
      source: currentSource, blocks: input.blocks, labelId: label?.id });
  });

  // Fire-and-forget, as for every new issue: this is what makes it searchable.
  emitIssueCreated(made.issue, { userId: me, workspaceId, workspaceName: context.workspace.name || '', workspaceSlug: context.workspace.slug || '', source: 'agent-request' },
    { async: true }).catch(() => {});
  return { issue: { id: made.issue.id, issueKey: made.issue.issueKey }, ...(input.role === 'security' && { blocks: true as const }), ...(made.idle && { warning: 'seat_idle' as const }) };
}

/**
 * What every request has, however it was asked for: a Task in `projectId`, reported by `me`, assigned to that project's
 * default seat for the role and linked to its source. Call it inside a transaction in which that seat cannot be retired.
 */
async function writeRequest(tx: Prisma.TransactionClient, input: { workspaceId: string; me: string; projectId: string; from?: string; role: RequestRole;
  title: string; body: string; source: { id: string; issueKey: string | null; projectId: string; priority: string }; blocks?: boolean; labelId?: string }) {
  const { workspaceId, me, projectId } = input, kind = REQUESTS[input.role];
  const to = await tx.agentSeat.findFirst({ where: { projectId, role: kind.seat, isDefault: true, retiredAt: null },
    select: { userId: true, name: true, lastSeenAt: true, byRunner: true } });
  if (!to) throw new HandoffError('no_default_seat', `The project has no ${kind.seat} seat to take this request`, 409);
  // Work reaches a seat by someone else's hand: a request to itself would be a seat assigning its own work.
  if (to.userId === me) throw new HandoffError('invalid_request', 'This request would go to the seat that files it');
  await assertAssignable(tx, { workspaceId, projectId, agentRequestRole: input.role }, to.userId);
  if (input.from && input.from !== projectId) {
    // A request is from a project when a seat of that project reported it.
    const open = await tx.issue.count({ where: { projectId, agentRequestRole: { not: null }, reporter: { agentSeat: { projectId: input.from } }, ...NOT_DONE } });
    if (open >= REQUEST_CAP) throw new HandoffError('request_cap', `This project has ${REQUEST_CAP} open requests in that project; one of them has to be done first`, 429);
  }

  const issueKey = await allocateIssueKey(tx, projectId);
  const status = await tx.projectStatus.findFirst({ where: { projectId, isDefault: true }, orderBy: DEFAULT_STATUS_ORDER, select: { id: true, name: true } });
  const now = new Date();
  const issue = await tx.issue.create({ data: {
    workspaceId, projectId, issueKey, type: 'TASK', title: input.title, description: input.body, priority: input.source.priority,
    statusId: status?.id, statusValue: status?.name, status: status?.name, reporterId: me, assigneeId: to.userId, agentRequestRole: input.role,
    ...(input.labelId && { labels: { connect: { id: input.labelId } } }),
  } });
  await tx.issueAssignee.create({ data: { issueId: issue.id, userId: to.userId, role: 'ASSIGNEE', status: 'APPROVED', assignedAt: now, approvedAt: now, approvedBy: me } });
  const security = input.role === 'security';
  await tx.issueRelation.create({ data: { sourceIssueId: issue.id, targetIssueId: input.source.id, relationType: input.blocks || security ? 'BLOCKS' : 'RELATES_TO', createdBy: me } });
  if (security) {
    // On both timelines. The request's entry is what its verdict is later written from: the issue it was filed for,
    // kept where a link added afterwards cannot change it.
    const asked = (target: { id: string; projectId: string }, details: object) => ({ action: 'SECURITY_REQUESTED', itemType: 'ISSUE', itemId: target.id, userId: me,
      workspaceId, projectId: target.projectId, details: JSON.stringify(details) });
    await tx.issueActivity.createMany({ data: [asked(issue, { forIssueId: input.source.id, forIssueKey: input.source.issueKey ?? input.source.id }),
      asked(input.source, { requestId: issue.id, requestKey: issue.issueKey ?? issue.id })] });
  }
  // Only a release seat is expected to be there all the time: a project has one, and a release waits on it.
  const idle = kind.seat === 'release' && !(to.lastSeenAt && to.lastSeenAt.getTime() > now.getTime() - IDLE_MS);
  if (idle) {
    await tx.issueComment.create({ data: { issueId: issue.id, authorId: me, content: `${to.name}, this project's release seat, ${to.lastSeenAt
      ? `last read its inbox at ${to.lastSeenAt.toISOString()}` : 'has never read its inbox'}. This request waits until it does. If the release seat is not running, a person has to start it.` } });
  }
  // A seat a runner runs works only while a runner holds a usable token for it: before the first fetch, and again
  // once the last token it fetched has run out, which is what a runner that stayed away through the renewal window leaves.
  const fetched = to.byRunner ? await tx.appToken.findFirst({ where: { userId: to.userId, runnerId: { not: null }, isRevoked: false },
    orderBy: { createdAt: 'desc' }, select: { tokenExpiresAt: true } }) : null;
  const waits = to.byRunner && !(fetched?.tokenExpiresAt && fetched.tokenExpiresAt > now);
  if (waits) {
    await tx.issueComment.create({ data: { issueId: issue.id, authorId: me, content: fetched?.tokenExpiresAt
      ? `${to.name} is run by a runner, and the last token a runner fetched for it ran out at ${fetched.tokenExpiresAt.toISOString()}. A token is renewed when its runner asks, so this one has not asked for a week or more. This request waits until a runner fetches a token again.`
      : `${to.name} is run by a runner, and no runner has fetched its token yet. This request waits until one has: the seat's owner connects a runner under Agents, Runners.` } });
  }
  return { issue, idle: idle || waits };
}

/**
 * Rule 9, for labels added to an issue; call inside the issue's write transaction. False for a project that uses
 * handoffs, where the caller hands the labels to their subscribers. In a project that uses seats a label hands work to
 * nobody, and the label of a request role asks for that request: one Task for the project's default seat of the role,
 * reported by whoever added the label and related to the issue. Nothing is filed while a request of that role for the
 * issue is still open, so adding the label twice asks once, nor for an issue that is itself a request. With no seat to
 * take it the refusal undoes the whole edit, so the label never sits there asking nobody. The text is the server's
 * and points at the issue, so it is not held to the issue template. An agent token that is not a seat asks for a
 * release this way and for nothing else (decided 16 Nov 2026, CLB-527): a review it asks for only as a seat. Its
 * release request is a new issue for a seat, so rule 7's daily cap counts it with the issues the token creates for seats.
 */
export async function labelRequests(tx: Prisma.TransactionClient, me: string, issue: { id: string; workspaceId: string; projectId: string },
  added: { id: string; name: string }[]) {
  const project = await tx.project.findUnique({ where: { id: issue.projectId }, select: { agentMode: true } });
  if (project?.agentMode !== 'seats') return false;
  const source = await tx.issue.findUnique({ where: { id: issue.id }, select: { id: true, issueKey: true, title: true, priority: true, agentRequestRole: true } });
  if (!source || source.agentRequestRole) return true;
  let agent: boolean | undefined;
  for (const role of ['review', 'release'] as const) {
    const kind = REQUESTS[role], label = added.find(candidate => candidate.name === kind.label);
    if (!label) continue;
    // An agent token that is not a seat.
    agent ??= !await tx.agentSeat.findFirst({ where: { userId: me, retiredAt: null }, select: { id: true } }) && !!await tx.appToken.findFirst({ where: { userId: me, app: { slug: AGENT_APP_SLUG } }, select: { id: true } });
    if (role !== 'release' && agent) {
      throw new HandoffError('assign_by_person', `An agent token that is not a seat does not ask for a ${role} by label; a person or a seat of the project adds it`, 403);
    }
    if (await tx.issue.count({ where: { projectId: issue.projectId, agentRequestRole: role,
      sourceRelations: { some: { targetIssueId: issue.id, relationType: { in: ['RELATES_TO', 'BLOCKS'] } } }, ...NOT_DONE } })) continue;
    // The seat's row, not the project's seat lock that `fileRequest` takes before it locks its source issue: this
    // transaction already holds the issue, and the other order could deadlock with it. Retiring a seat waits for the row.
    await tx.$queryRaw`SELECT "id" FROM "AgentSeat" WHERE "projectId" = ${issue.projectId} AND "role" = ${kind.seat} AND "isDefault" AND "retiredAt" IS NULL FOR SHARE`;
    // shortcut: an issue edit is serializable, so it does not see an issue the same token created for a seat after the edit
    // began; in that instant the count can end one over the cap. A counter row per account closes it if that matters.
    if (agent && await seatHandoffCapReached(tx, me)) {
      throw new HandoffError('assign_cap', `An agent token that is not a seat gives seats ${ASSIGN_CAP} new issues a day (UTC), release requests by label among them; a person or a seat of the project asks for this one`, 429);
    }
    const name = source.issueKey ?? source.id;
    // shortcut: no issue.created event, so semantic search learns of this request only when it is next edited; emit after commit if that matters.
    const made = await writeRequest(tx, { workspaceId: issue.workspaceId, me, projectId: issue.projectId, role, source: { ...source, projectId: issue.projectId }, labelId: label.id,
      title: `${kind.label}: ${name} ${source.title}`.slice(0, 200),
      body: `Asked for by adding the "${kind.label}" label to ${name}.\n\nRead ${name}, its comments and its timeline for what is asked.` });
    if (agent) await countSeatHandoff(tx, issue.workspaceId, me, made.issue.id, made.issue.assigneeId!);
  }
  return true;
}
