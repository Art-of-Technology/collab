import { prisma } from '@/lib/prisma';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import { issueAccessWhere, issueReadAccessWhere } from '@/lib/issue-finder';
import { inboxOf, type InboxItem } from '@/lib/agent-runs';

/**
 * True while a project of the workspace still works with handoffs: the Agents page lists "Handoffs (old)" until
 * the last one has switched to seats. An archived project is not waited for; a project that never was archived has no value there.
 */
export async function usesHandoffs(workspaceId: string): Promise<boolean> {
  return !!await prisma.project.findFirst({ where: { workspaceId, agentMode: { not: 'seats' }, OR: [{ isArchived: null }, { isArchived: false }] }, select: { id: true } });
}

/**
 * What the Runners tab needs before it asks for the runners themselves: the workspace, and for its owner the people a
 * runner can be admitted for. Only the owner admits a runner for someone else, so nobody else gets the list. Null when
 * the workspace is not the person's.
 */
export async function readRunnersTab(userId: string, workspaceIdOrSlug: string) {
  const workspace = await prisma.workspace.findFirst({ where: postWorkspaceAccessWhere(userId, workspaceIdOrSlug), select: { id: true, slug: true, ownerId: true } });
  if (!workspace) return null;
  const people = workspace.ownerId !== userId ? [] : await prisma.user.findMany({
    where: { OR: [{ id: userId }, { email: { not: null }, workspaceMemberships: { some: { workspaceId: workspace.id, status: true } } }] },
    select: { id: true, name: true, email: true }, orderBy: { name: 'asc' },
  });
  return { workspace: { id: workspace.id, slug: workspace.slug }, people: people.map(person => ({ id: person.id, name: person.name || person.email || person.id })) };
}

/**
 * The seats a person may see: those of the projects the person can read, each with the issues it has a run open on and
 * the issues that wait for it, which is the seat's own inbox as the seat reads it. Null when the workspace is not
 * the person's. It changes nothing.
 */
export async function readSeats(userId: string, workspaceIdOrSlug: string) {
  const workspace = await prisma.workspace.findFirst({ where: postWorkspaceAccessWhere(userId, workspaceIdOrSlug), select: { id: true, slug: true } });
  if (!workspace) return null;
  const rows = await prisma.agentSeat.findMany({
    where: { workspaceId: workspace.id, retiredAt: null, project: { workspaceId: workspace.id, ...issueAccessWhere(userId) } },
    select: {
      id: true, userId: true, name: true, role: true, isDefault: true, byRunner: true, projectId: true, project: { select: { name: true } },
      // A runner works one issue at a time, but a lost run stays open until someone clears it, so a seat can have several.
      runs: { where: { endedAt: null, issue: issueReadAccessWhere(userId) }, orderBy: { startedAt: 'desc' },
        select: { id: true, state: true, leaseUntil: true, startedAt: true, issue: { select: { id: true, issueKey: true, title: true } } } },
    },
    orderBy: [{ project: { name: 'asc' } }, { role: 'asc' }, { name: 'asc' }],
  });
  const inboxes: InboxItem[][] = [];
  // shortcut: one small read per seat, one after the other so a page view holds one database connection; fine for
  // tens of seats. Read all seats in one query when a workspace has hundreds.
  for (const seat of rows) inboxes.push((await inboxOf(workspace.id, seat.userId, seat)).items);
  // The viewer's own read rule, asked once for everything the seats' inboxes named.
  const ids = inboxes.flat().map(item => item.issueId);
  const readable = new Set((ids.length ? await prisma.issue.findMany({ where: { id: { in: ids }, ...issueReadAccessWhere(userId) }, select: { id: true } }) : []).map(issue => issue.id));
  const now = new Date();
  // A seat a runner runs works only once a runner holds a usable token for it.
  const byRunner = rows.filter(seat => seat.byRunner).map(seat => seat.userId);
  const fetched = new Set((byRunner.length ? await prisma.appToken.findMany({ where: { userId: { in: byRunner }, runnerId: { not: null }, isRevoked: false, tokenExpiresAt: { gt: now } },
    select: { userId: true } }) : []).map(token => token.userId));
  return {
    workspace,
    seats: rows.map(({ userId: account, runs, project, projectId: _project, byRunner: runner, ...seat }, index) => ({
      ...seat, project: project.name, noRunner: runner && !fetched.has(account),
      working: runs.map(run => ({ id: run.id, issueId: run.issue.id, issueKey: run.issue.issueKey, title: run.issue.title, since: run.startedAt.toISOString(),
        // A lapsed lease is a lost run whether or not a seat has read its inbox since and marked it.
        lost: run.state === 'lost' || (!!run.leaseUntil && run.leaseUntil < now) })),
      waiting: inboxes[index].filter(item => readable.has(item.issueId)),
    })),
  };
}

export type SeatsView = NonNullable<Awaited<ReturnType<typeof readSeats>>>;
