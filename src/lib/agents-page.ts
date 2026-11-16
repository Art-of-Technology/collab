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
      id: true, userId: true, name: true, role: true, isDefault: true, projectId: true, project: { select: { name: true } },
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
  return {
    workspace,
    seats: rows.map(({ userId: _account, runs, project, projectId: _project, ...seat }, index) => ({
      ...seat, project: project.name,
      working: runs.map(run => ({ id: run.id, issueId: run.issue.id, issueKey: run.issue.issueKey, title: run.issue.title, since: run.startedAt.toISOString(),
        // A lapsed lease is a lost run whether or not a seat has read its inbox since and marked it.
        lost: run.state === 'lost' || (!!run.leaseUntil && run.leaseUntil < now) })),
      waiting: inboxes[index].filter(item => readable.has(item.issueId)),
    })),
  };
}

export type SeatsView = NonNullable<Awaited<ReturnType<typeof readSeats>>>;
