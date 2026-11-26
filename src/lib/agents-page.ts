import { prisma } from '@/lib/prisma';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import { issueAccessWhere, issueReadAccessWhere } from '@/lib/issue-finder';
import { inboxOf, type InboxItem } from '@/lib/agent-runs';
import { fetchedBy, runnerPeopleBelow } from '@/lib/agent-runners';
import { MEMBER_ROLES, seatRoom } from '@/lib/agent-seats';
import { checkUserPermission, Permission } from '@/lib/permissions';
import { getWorkspaceAuthority, may } from '@/lib/workspace-authority';

/**
 * True while a project of the workspace still works with handoffs: the Agents page lists "Handoffs (old)" until
 * the last one has switched to seats. An archived project is not waited for; a project that never was archived has no value there.
 */
export async function usesHandoffs(workspaceId: string): Promise<boolean> {
  return !!await prisma.project.findFirst({ where: { workspaceId, agentMode: { not: 'seats' }, OR: [{ isArchived: null }, { isArchived: false }] }, select: { id: true } });
}

/**
 * What the Runners tab needs before it asks for the runners themselves: the workspace, and the people the viewer may
 * connect a runner for: themself and, for an Owner, the people below them, for the primary owner everyone. Nobody else
 * gets the list. Null when the workspace is not the person's.
 */
export async function readRunnersTab(userId: string, workspaceIdOrSlug: string) {
  const workspace = await prisma.workspace.findFirst({ where: postWorkspaceAccessWhere(userId, workspaceIdOrSlug), select: { id: true, slug: true } });
  if (!workspace) return null;
  const viewer = await getWorkspaceAuthority(userId, workspace.id);
  const people = !may(viewer, 'runners.manage') ? [] : await prisma.user.findMany({
    where: { OR: [{ id: userId }, { email: { not: null }, workspaceMemberships: { some: { workspaceId: workspace.id, status: true } } }] },
    select: { id: true, name: true, email: true }, orderBy: { name: 'asc' },
  });
  const others = people.length ? await runnerPeopleBelow(userId, workspace.id, people.map(person => person.id), 'connect') : new Set<string>();
  return { workspace: { id: workspace.id, slug: workspace.slug }, people: people.filter(person => person.id === userId || others.has(person.id))
    .map(person => ({ id: person.id, name: person.name || person.email || person.id })) };
}

/**
 * The seats a person may see: those of the projects the person can read, each with the issues it has a run open on and
 * the issues that wait for it, which is the seat's own inbox as the seat reads it. With them the projects that use
 * seats, for the person's own seats there. Null when the workspace is not the person's. It changes nothing.
 *
 * A seat's room is the reader's to see when the seat is the reader's own, or when the reader manages the workspace
 * (`canManage`). Every other seat has `room: null`: its figure, program, time and reason stay on the server.
 */
export async function readSeats(userId: string, workspaceIdOrSlug: string) {
  const workspace = await prisma.workspace.findFirst({ where: postWorkspaceAccessWhere(userId, workspaceIdOrSlug), select: { id: true, slug: true } });
  if (!workspace) return null;
  const rows = await prisma.agentSeat.findMany({
    // A seat of the whole workspace (no project, CLB-613) is listed to everyone who may see the workspace.
    where: { workspaceId: workspace.id, retiredAt: null, OR: [{ projectId: null }, { project: { workspaceId: workspace.id, ...issueAccessWhere(userId) } }] },
    select: {
      id: true, userId: true, name: true, role: true, isDefault: true, byRunner: true, projectId: true, project: { select: { name: true } },
      ownerId: true, room: true, roomProgram: true, roomAt: true, customRole: { select: { name: true } },
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
  // A seat of the whole workspace has no inbox until CLB-615: nothing waits for it here.
  for (const seat of rows) inboxes.push(seat.projectId === null ? [] : (await inboxOf(workspace.id, seat.userId, { ...seat, projectId: seat.projectId })).items);
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
  const canManage = (await checkUserPermission(userId, workspace.id, Permission.MANAGE_AGENTS)).hasPermission;
  // A person has one runner per workspace; should two ever stand, the one admitted last is the person's.
  const runners = await prisma.agentRunner.findMany({ where: { workspaceId: workspace.id, ownerId: { in: rows.flatMap(seat => seat.ownerId ?? []) }, removedAt: null },
    orderBy: { admittedAt: 'desc' }, select: { ownerId: true, name: true, state: true, lastSeenAt: true } });
  const runnerOf = (ownerId: string | null) => runners.find(row => row.ownerId === ownerId) ?? null;
  return {
    workspace, canManage,
    projects: projects.map(({ agentSeats, agentMode, isArchived, ...project }) => ({ ...project, mine: [...new Set(agentSeats.map(seat => seat.role))],
      // Where seats can be added at all: the switch and the Add button are offered only there.
      addable: agentMode === 'seats' && !isArchived })),
    seats: rows.map(({ userId: account, runs, project, projectId: _project, byRunner: runner, owner, room, roomProgram, roomAt, customRole, ...seat }, index) => ({
      // `role` is the role it behaves as; `customRole` the name of the workspace's own role it has (CLB-628), shown in its place.
      // `project` is null for a seat whose scope is the whole workspace.
      ...seat, customRole: customRole?.name ?? null, project: project?.name ?? null, noRunner: runner && !fetched.has(account),
      // The name of the runner of the seat's person, for everyone; the room only for who may see it.
      runner: runnerOf(seat.ownerId)?.name ?? null,
      room: canManage || seat.ownerId === userId ? seatRoom({ byRunner: runner, room, roomProgram, roomAt }, runnerOf(seat.ownerId), now) : null,
      // The person whose sign-in runs the seat; null when no person's subscription pays for it.
      owner: owner ? owner.name || owner.email || owner.id : null,
      tokenExpired: runner && fetched.get(account)?.state === 'expired',
      working: runs.map(run => ({ id: run.id, issueId: run.issue.id, issueKey: run.issue.issueKey, title: run.issue.title, since: run.startedAt.toISOString(),
        // A lapsed lease is a lost run whether or not a seat has read its inbox since and marked it.
        lost: run.state === 'lost' || (!!run.leaseUntil && run.leaseUntil < now) })),
      // Whose seat has no room is the lead's to read, not everyone's who may see the seat: the reason alone is shown.
      waiting: inboxes[index].filter(item => readable.has(item.issueId)).map(({ noRoom: _noRoom, ...item }) => item),
    })),
  };
}

export type SeatsView = NonNullable<Awaited<ReturnType<typeof readSeats>>>;
