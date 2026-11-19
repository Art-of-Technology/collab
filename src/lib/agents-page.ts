import { prisma } from '@/lib/prisma';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import { issueAccessWhere, issueReadAccessWhere } from '@/lib/issue-finder';
import { inboxOf, type InboxItem } from '@/lib/agent-runs';
import { fetchedBy } from '@/lib/agent-runners';
import { MEMBER_ROLES } from '@/lib/agent-seats';

/**
 * True while a project of the workspace still works with handoffs: the Agents page lists "Handoffs (old)" until
 * the last one has switched to seats. An archived project is not waited for; a project that never was archived has no value there.
 */
export async function usesHandoffs(workspaceId: string): Promise<boolean> {
  return !!await prisma.project.findFirst({ where: { workspaceId, agentMode: { not: 'seats' }, OR: [{ isArchived: null }, { isArchived: false }] }, select: { id: true } });
}

/**
 * What the Runners tab needs before it asks for the runners themselves: the workspace, and for its owner the people a
 * runner can be connected for. Only the owner connects a runner for someone else, so nobody else gets the list. Null when
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
 * the issues that wait for it, which is the seat's own inbox as the seat reads it. With them the projects that use
 * seats, for the person's own seats there. Null when the workspace is not the person's. It changes nothing.
 */
export async function readSeats(userId: string, workspaceIdOrSlug: string) {
  const workspace = await prisma.workspace.findFirst({ where: postWorkspaceAccessWhere(userId, workspaceIdOrSlug), select: { id: true, slug: true } });
  if (!workspace) return null;
  const rows = await prisma.agentSeat.findMany({
    where: { workspaceId: workspace.id, retiredAt: null, project: { workspaceId: workspace.id, ...issueAccessWhere(userId) } },
    select: {
      id: true, userId: true, name: true, role: true, isDefault: true, byRunner: true, projectId: true, project: { select: { name: true } },
      owner: { select: { id: true, name: true, email: true } },
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
  // A seat a runner runs works only while a runner holds a usable token for it: `expired` is a seat whose runner
  // stayed away long enough for the last token it fetched to run out.
  const fetched = await fetchedBy(prisma, rows.filter(seat => seat.byRunner).map(seat => seat.userId));
  // The projects that use seats, each with its owner's switch and the roles the person already has a seat of there.
  // A project that stopped using seats or was archived stays listed while the person has such a seat, to remove it.
  const own = { ownerId: userId, retiredAt: null, role: { in: [...MEMBER_ROLES] } };
  const projects = await prisma.project.findMany({
    where: { workspaceId: workspace.id, ...issueAccessWhere(userId), OR: [{ agentMode: 'seats', OR: [{ isArchived: null }, { isArchived: false }] }, { agentSeats: { some: own } }] }, orderBy: { name: 'asc' },
    select: { id: true, slug: true, name: true, membersMayAddSeats: true, agentMode: true, isArchived: true, agentSeats: { where: own, orderBy: { role: 'asc' }, select: { role: true } } },
  });
  return {
    workspace,
    projects: projects.map(({ agentSeats, agentMode, isArchived, ...project }) => ({ ...project, mine: [...new Set(agentSeats.map(seat => seat.role))],
      // Where seats can be added at all: the switch and the Add button are offered only there.
      addable: agentMode === 'seats' && !isArchived })),
    seats: rows.map(({ userId: account, runs, project, projectId: _project, byRunner: runner, owner, ...seat }, index) => ({
      ...seat, project: project.name, noRunner: runner && !fetched.has(account),
      // The person whose sign-in runs the seat; null when no person's subscription pays for it.
      owner: owner ? owner.name || owner.email || owner.id : null,
      tokenExpired: runner && fetched.get(account)?.state === 'expired',
      working: runs.map(run => ({ id: run.id, issueId: run.issue.id, issueKey: run.issue.issueKey, title: run.issue.title, since: run.startedAt.toISOString(),
        // A lapsed lease is a lost run whether or not a seat has read its inbox since and marked it.
        lost: run.state === 'lost' || (!!run.leaseUntil && run.leaseUntil < now) })),
      waiting: inboxes[index].filter(item => readable.has(item.issueId)),
    })),
  };
}

export type SeatsView = NonNullable<Awaited<ReturnType<typeof readSeats>>>;
