import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { HandoffError } from '@/lib/agent-handoffs';
import { agentModeState, setAgentMode } from '@/lib/agent-mode';
import { RUNNER_TOKEN_DAYS, runnerSeats } from '@/lib/agent-runners';
import { MEMBER_ROLES, createSeat, lockMemberSeatProject, retireSeat } from '@/lib/agent-seats';
import { AGENT_APP_SLUG } from '@/lib/agent-tokens';
import type { AppAuthContext } from '@/lib/apps/auth-middleware';
import { issueAccessWhere } from '@/lib/issue-finder';
import { Permission, checkUserPermission } from '@/lib/permissions';
import { seatOwnerAccess } from '@/lib/workspace-authority';

export { HandoffError };
type Caller = Pick<AppAuthContext, 'user' | 'app' | 'workspace'>;

/** The seats a project is given, in the order they are made. The first of a role becomes its default. */
export const SETUP_ROLES = ['developer', 'reviewer', 'release', 'security'] as const;
/** What stops the setup. While one of these holds, the preview is all there is and nothing is made. */
const STOPS = {
  project_archived: 'This project is archived: an archived project keeps no seat token a runner fetched. Unarchive it first',
  status_groups: 'Before this project uses seats, put a status in the in progress group and one in the done group: a run moves its issue there when it starts and when it is done',
  no_runner: "No runner is connected to this workspace, so nothing would fetch the seats' tokens. Start the pairing on the machine that runs the seats and type its code under Agents, Runners",
  runner_choice: 'Several runners are connected here and none of them is yours. Connect a runner for yourself, or create the seats in the web app',
  runner_above: 'The only runner connected here belongs to someone at or above your own level, and the seats would be theirs. Connect a runner for yourself, or ask them to set the project up',
} as const;

export const setupSchema = z.object({
  /** Issue keys or ids of the claims to carry over; without it every claim in the preview is carried. */
  carryOver: z.array(z.string().trim().min(1).max(128)).max(200).optional(),
}).strict();

const seatName = (project: string, role: string) => `${project} ${role[0].toUpperCase()}${role.slice(1)}`;

/** Rule 5: a person sets a project up. An agent token, seat or not, is refused before anything is read or made. */
async function managingPerson(context: Caller) {
  if (context.app.slug === AGENT_APP_SLUG) {
    throw new HandoffError('person_required', 'A person with permission to manage the workspace sets a project up; an agent token or a seat token cannot', 403);
  }
  if (!(await checkUserPermission(context.user.id, context.workspace.id, Permission.MANAGE_AGENTS)).hasPermission) {
    throw new HandoffError('forbidden', "This needs permission to manage the workspace's agents", 403);
  }
}

/**
 * Rule 5: what `collab seat setup` would do to a project, and what stops it. It changes nothing.
 * The four seats with the name a missing one would get, the runner that would run them, the status groups the switch
 * still needs, and the recent claims that would go to the developer seat. A seat of a role that already exists is
 * listed as it is and left alone, whoever made it and however it is run.
 */
export async function seatSetupState(context: Caller, projectRef: string) {
  await managingPerson(context);
  const workspaceId = context.workspace.id;
  const project = await prisma.project.findFirst({ where: { workspaceId, OR: [{ id: projectRef }, { issuePrefix: projectRef }] },
    select: { id: true, name: true, issuePrefix: true, isArchived: true } });
  if (!project) throw new HandoffError('project_not_found', 'Project not found in this workspace', 404);

  const state = await agentModeState(prisma, project.id);
  const existing = await prisma.agentSeat.findMany({ where: { projectId: project.id, retiredAt: null },
    orderBy: { createdAt: 'asc' }, select: { id: true, name: true, role: true, byRunner: true, isDefault: true } });
  const seats = SETUP_ROLES.map(role => {
    const has = existing.find(seat => seat.role === role);
    return has ? { role, name: has.name, exists: true, byRunner: has.byRunner, isDefault: has.isDefault }
      : { role, name: seatName(project.name, role), exists: false, byRunner: true, isDefault: true };
  });
  // The person's own runner runs the new seats; with none of their own, the workspace's single runner does.
  const runners = await prisma.agentRunner.findMany({ where: { workspaceId, removedAt: null }, orderBy: { admittedAt: 'asc' },
    select: { id: true, name: true, ownerId: true, lastSeenAt: true } });
  const mine = runners.find(runner => runner.ownerId === context.user.id);
  const runner = mine ?? (runners.length === 1 ? runners[0] : null);
  // Only the switch needs the groups, so a project already on seats is not held up by them.
  const missingGroups = state.mode === 'seats' ? []
    : (['in_progress', 'done'] as const).filter(group => !state.statuses.some(status => status.category === group));
  const missing = seats.filter(seat => !seat.exists);
  // The seats would be the runner's person's, and someone else's seat follows the rank rule (CLB-1185): the apply would refuse.
  const above = !!missing.length && !!runner && (await seatOwnerAccess(context.user.id, workspaceId, runner.ownerId))() === 'refused';
  const blocked = project.isArchived ? 'project_archived' : missingGroups.length ? 'status_groups'
    : !missing.length ? null : !runner ? runners.length ? 'runner_choice' : 'no_runner' : above ? 'runner_above' : null;

  return {
    project: { id: project.id, name: project.name, issuePrefix: project.issuePrefix, mode: state.mode },
    seats, missing: missing.map(seat => seat.role), statuses: state.statuses, missingGroups,
    runner: runner ? { id: runner.id, name: runner.name, ownerId: runner.ownerId, lastSeenAt: runner.lastSeenAt, yours: runner.ownerId === context.user.id } : null,
    claims: state.claims.map(claim => ({ issueId: claim.issueId, issueKey: claim.issueKey, title: claim.title, agent: claim.agent, touchedAt: claim.touchedAt })),
    blocked, reason: blocked ? STOPS[blocked] : null,
  };
}

/**
 * Rule 5: give an existing project its seats and switch it, in one call. The seats that are missing are created to be
 * run by the runner, which fetches their tokens on its next ask, so none is made here and none is shown to anyone; a
 * seat of a role that already exists is left alone. Then the project is switched to seats and the chosen claims are
 * carried over to its developer seat. Asking again creates nothing: the seats are there, the project is on seats, and
 * an issue that already belongs to a seat is no longer a claim to carry.
 */
export async function setupSeats(context: Caller, projectRef: string, input: z.infer<typeof setupSchema>) {
  const preview = await seatSetupState(context, projectRef);
  if (preview.blocked) throw Object.assign(new HandoffError('setup_blocked', preview.reason!, 409), { body: { blocked: preview.blocked, missingGroups: preview.missingGroups } });
  const workspaceId = context.workspace.id, actorId = context.user.id, projectId = preview.project.id;

  const created: string[] = [];
  for (const seat of preview.seats.filter(row => !row.exists)) {
    const made = await createSeat({ workspaceId, actorId, projectId, role: seat.role, ownerId: preview.runner?.ownerId ?? null,
      name: seat.name, expiresInDays: RUNNER_TOKEN_DAYS, byRunner: true });
    if (made.error) throw new HandoffError(made.error, `The ${seat.role} seat could not be created (${made.error}); the seats made before it stay`, 409);
    created.push(seat.name);
  }
  // Without --carry-over every claim the preview listed is carried; a key names one of them and nothing else.
  const chosen = input.carryOver
    ? preview.claims.filter(claim => input.carryOver!.includes(claim.issueKey ?? '') || input.carryOver!.includes(claim.issueId))
    : preview.claims;
  const state = await setAgentMode({ workspaceId, projectId, actorId, mode: 'seats', carryOver: chosen.map(claim => claim.issueId) });
  return {
    project: { ...preview.project, mode: state.mode }, created,
    carriedOver: chosen.map(claim => claim.issueKey ?? claim.issueId),
    // Each seat with whether a runner has fetched its token yet. The token itself is never part of this.
    seats: await runnerSeats(prisma, projectId),
  };
}

type Own = { workspaceId: string; userId: string; projectId: string };

/**
 * A person adds their own seats to a project they can see, in one step: a developer, a reviewer and a security seat
 * that they own, run by their own runner, named "<Project> <Role> (<first name>)"; when someone else's agent has
 * one of those names, all are named with the last initial, "(<First> <L>.)", and after that with the full name.
 * Refused as a whole unless the project's owner switched it on (`members_add_off`). Only the roles the person has no
 * seat of are made, and none takes a role's default from a seat that has it. There is no owner to name here: the
 * seats are the caller's.
 * Each seat is made on its own, as `setupSeats` makes them: a role that cannot be made is named in `refused` with the
 * reason, and the others stay.
 */
export async function addMySeats({ workspaceId, userId, projectId }: Own) {
  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId, ...issueAccessWhere(userId) }, select: { name: true } });
  if (!project) throw new HandoffError('project_not_found', 'Project not found in this workspace', 404);
  await prisma.$transaction(tx => lockMemberSeatProject(tx, workspaceId, projectId));
  const me = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } });
  const words = me.name?.trim().split(/\s+/) ?? [];
  const first = words[0] || (me.email || userId).split('@')[0];
  // What goes in the brackets, in the order it is tried: the first name, then with the last initial, then the full name.
  const forms = words.length > 1 ? [first, `${first} ${Array.from(words[words.length - 1])[0].toUpperCase()}.`, words.join(' ')] : [first];
  const mine = await prisma.agentSeat.findMany({ where: { projectId, ownerId: userId, retiredAt: null }, select: { role: true } });
  const roles = MEMBER_ROLES.filter(role => !mine.some(seat => seat.role === role));
  const named = (role: string, form: number) => `${seatName(project.name, role)} (${forms[form]})`;
  const created: string[] = [], refused: { name: string; code: string; reason: string }[] = [];
  // One form for the whole request, so a person is not "(Deniz)" on one seat and "(Deniz K.)" on another.
  let form = 0;
  for (const role of roles) {
    for (;;) {
      const name = named(role, form), last = form === forms.length - 1;
      try {
        // Before the last form a seat is made only if every name of its form is free, which is decided where it is
        // written, under the project's lock. In the last form each seat stands for itself.
        const made = await createSeat({ workspaceId, actorId: userId, projectId, role, ownerId: userId, name, expiresInDays: RUNNER_TOKEN_DAYS, byRunner: true, own: true,
          ...(!last && { together: roles.map(other => named(other, form)) }) });
        if (made.error) refused.push({ name, code: made.error, reason: `The seat could not be created (${made.error})` });
        else created.push(made.seat.name);
      } catch (error) {
        if (!(error instanceof HandoffError)) throw error;
        // A name of this form is someone else's: this seat again in the next form, and the seats after it too.
        if (error.code === 'name_taken' && !last) { form++; continue; }
        // The switch went off, or the project was archived or removed, after the check above. With nothing made that is
        // the answer to the whole request, as it is when the check finds it; once a seat exists the reply has to name it.
        if (['members_add_off', 'project_archived', 'project_not_found'].includes(error.code) && !created.length) throw error;
        // The person got a seat of this role while this ran, so the role is not missing after all.
        if (error.code !== 'own_seat_exists') refused.push({ name, code: error.code, reason: error.message });
      }
      break;
    }
  }
  return { created, refused };
}

/**
 * A person removes their own developer, reviewer and security seats of a project, whether or not adding is switched
 * on. Each is retired as any seat is: its open issues are unassigned, and a seat with a run open stays and is named
 * in `kept` with the reason.
 */
export async function removeMySeats({ workspaceId, userId, projectId }: Own) {
  const only = { projectId, ownerId: userId, role: { in: [...MEMBER_ROLES] } };
  const seats = await prisma.agentSeat.findMany({ where: { ...only, workspaceId, retiredAt: null }, orderBy: [{ role: 'asc' }, { name: 'asc' }], select: { id: true, name: true } });
  const removed: string[] = [], kept: { name: string; reason: string }[] = [];
  for (const seat of seats) {
    try {
      await retireSeat({ workspaceId, actorId: userId, seatId: seat.id, only });
      removed.push(seat.name);
    } catch (error) {
      if (!(error instanceof HandoffError)) throw error;
      kept.push({ name: seat.name, reason: error.message });
    }
  }
  return { removed, kept };
}
