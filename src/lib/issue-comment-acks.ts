import { prisma } from '@/lib/prisma';
import { publishEvent } from '@/lib/redis';
import { PERSON, isStopIssueDone } from '@/lib/agent-stop-boundary';
import { extractMentionUserIds } from '@/utils/mentions';
import { contextSince } from '@/lib/agent-context-since';

/** The reaction type under which a seat's account says it has taken a person's comment in. */
export const ACK_TYPE = 'ack';
/**
 * A runner not seen for this long no longer counts as listening. Its `lastSeenAt` is stamped at most once a minute and it
 * asks about once a minute, so a healthy runner can look two minutes old.
 */
export const RUNNER_SILENT_MS = 180_000;
/** The states of a run whose session is taken to be alive: `LIVE` in `agent-runs.ts`, which imports this module. */
const LIVE = ['running', 'waiting'];
/** The most rows one call writes. */
export const ACK_WRITE_CAP = 200;

export type CommentAck = {
  state: 'acked' | 'waiting' | 'none';
  seats: { userId: string; name: string; at: string }[];
  waitingFor?: string;
  reason?: 'in_run' | 'runner_silent' | 'issue_done' | 'not_holder' | 'not_given';
  missed?: string[];
};
export type AckComment = { id: string; authorId: string; createdAt: Date | string; content: string; html?: string | null;
  reactions?: { type: string; authorId?: string; createdAt: Date | string; author?: { id: string; name: string | null } }[] };

/** How long a workspace's "no ack yet" is believed before it is looked up again. */
const NO_ACK_YET_MS = 60_000;
/**
 * Each workspace's first ack, remembered for the life of the process: the lookup joins reactions to comments to issues,
 * and lists are read often. A found start is kept (it moves earlier only if rows are deleted, and then the lines start a
 * little late); "none yet" (`at: null`) is kept for `NO_ACK_YET_MS`, or until this process records an ack there.
 */
const ackStarts = new Map<string, { at: number | null; checked: number }>();

/** Forgets every remembered first ack: for tests. */
export function forgetAckStarts(): void {
  ackStarts.clear();
}

/** Says what failed, and never throws itself: a missing or broken console must not turn a courtesy into a failure. */
function report(what: string, error: unknown) {
  try { console.error(`[comment-acks] ${what}`, error); } catch { /* nothing more to do */ }
}

/**
 * Records that a seat has taken in the person comments of an issue: one reaction row of type `ack` per comment, under
 * the seat's account. A comment already acked by that seat is left alone, so a second call writes nothing and says
 * nothing. Never throws: a failure resolves 0, since an ack is a courtesy and must not fail the run that gives it.
 */
export async function recordCommentAcks(input: { workspaceId: string; issueId: string; seatUserId: string;
  commentIds?: string[]; createdAt?: { gt?: Date; gte?: Date; lte?: Date } }): Promise<number> {
  try {
    const { workspaceId, issueId, seatUserId, commentIds, createdAt } = input;
    const seat = await prisma.agentSeat.findFirst({ where: { userId: seatUserId, retiredAt: null }, select: { userId: true } });
    if (!seat) return 0;
    const comments = await prisma.issueComment.findMany({
      where: {
        issueId, author: PERSON,
        ...(createdAt ? { createdAt } : {}),
        ...(commentIds ? { id: { in: commentIds } } : {}),
        reactions: { none: { type: ACK_TYPE, authorId: seatUserId } },
      },
      orderBy: { createdAt: 'desc' }, take: ACK_WRITE_CAP, select: { id: true },
    });
    if (!comments.length) return 0;
    await prisma.issueCommentReaction.createMany({
      data: comments.map(comment => ({ type: ACK_TYPE, commentId: comment.id, authorId: seatUserId })), skipDuplicates: true,
    });
    // The workspace has an ack now: a remembered "none yet" no longer holds.
    if (ackStarts.get(workspaceId)?.at === null) ackStarts.delete(workspaceId);
    await publishEvent(`workspace:${workspaceId}:events`, { type: 'issue.comments.changed', workspaceId, issueId }, 1000);
    return comments.length;
  } catch (error) {
    report('recording failed', error);
    return 0;
  }
}

const time = (value: Date | string) => new Date(value).getTime();

/**
 * What each person comment of an issue says about whether an agent has taken it in: acked by seats, waiting for the seat
 * that holds the issue, none (the issue is done, no run will be given the comment, or nobody who was mentioned holds it),
 * or no entry at all. Waiting and none start at the workspace's first ack: a comment written before it, or any comment
 * while the workspace has none, gets no such entry. Keyed by comment id. Never rejects: a failure resolves an empty map,
 * so the comments still list without their acks.
 */
export async function commentAcks(issueId: string, comments: AckComment[], now: Date = new Date()): Promise<Map<string, CommentAck>> {
  try {
    const result = new Map<string, CommentAck>();
    if (!comments.length) return result;
    const people = new Set((await prisma.user.findMany({
      where: { id: { in: [...new Set(comments.map(comment => comment.authorId))] }, ...PERSON }, select: { id: true },
    })).map(user => user.id));
    const theirs = comments.filter(comment => people.has(comment.authorId));
    if (!theirs.length) return result;

    const issue = await prisma.issue.findUnique({
      where: { id: issueId },
      select: { workspaceId: true, assigneeId: true, status: true, statusValue: true, projectStatus: { select: { category: true, isFinal: true } } },
    });
    if (!issue) return result;
    // The moment this workspace's acks began: before it, no comment could have been acked, so none is said to wait.
    let known = ackStarts.get(issue.workspaceId);
    if (!known || (known.at === null && now.getTime() - known.checked >= NO_ACK_YET_MS)) {
      const first = await prisma.issueCommentReaction.findFirst({
        where: { type: ACK_TYPE, comment: { issue: { workspaceId: issue.workspaceId } } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true },
      });
      known = { at: first ? first.createdAt.getTime() : null, checked: now.getTime() };
      ackStarts.set(issue.workspaceId, known);
    }
    const start = known.at ?? Infinity;
    const holder = issue.assigneeId
      ? await prisma.agentSeat.findFirst({ where: { userId: issue.assigneeId, retiredAt: null }, select: { userId: true, name: true, byRunner: true, ownerId: true } })
      : null;
    const done = isStopIssueDone(issue);

    const mentions = new Map(theirs.map(comment => [comment.id, [...new Set([...extractMentionUserIds(comment.content), ...extractMentionUserIds(comment.html ?? '')])]]));
    const mentioned = [...new Set([...mentions.values()].flat())];
    const mentionedSeats = mentioned.length
      ? await prisma.agentSeat.findMany({ where: { userId: { in: mentioned }, retiredAt: null }, select: { userId: true, name: true } })
      : [];
    const seatNames = new Map(mentionedSeats.map(seat => [seat.userId, seat.name]));
    const missedBy = (comment: AckComment) => (mentions.get(comment.id) ?? [])
      .filter(userId => seatNames.has(userId) && userId !== holder?.userId).map(userId => seatNames.get(userId)!);

    const ackers = [...new Set(theirs.flatMap(comment => (comment.reactions ?? []).filter(r => r.type === ACK_TYPE && !r.author?.name).map(r => r.authorId ?? r.author?.id ?? '')))].filter(Boolean);
    const lookedUp = ackers.length
      ? new Map((await prisma.agentSeat.findMany({ where: { userId: { in: ackers } }, select: { userId: true, name: true } })).map(seat => [seat.userId, seat.name]))
      : new Map<string, string>();

    const waiting = holder && !done;
    const openRuns = waiting
      ? await prisma.agentRun.findMany({ where: { issueId, userId: holder.userId, endedAt: null, state: { in: LIVE } }, select: { startedAt: true } })
      : [];
    // With no live run of its own on the issue, the seat is given a comment only by its next run's start, whose window
    // opens where `contextSince` says: a comment before that is given to no run.
    const window = waiting && !openRuns.length ? await contextSince(prisma, issueId) : undefined;
    const notGiven = (comment: AckComment) => !!window
      && (window.gte ? time(comment.createdAt) < window.gte.getTime() : !!window.gt && time(comment.createdAt) <= window.gt.getTime());
    let silent = false;
    if (waiting && holder.byRunner) {
      const runners = await prisma.agentRunner.findMany({
        where: { workspaceId: issue.workspaceId, ownerId: holder.ownerId, removedAt: null }, select: { lastSeenAt: true },
      });
      const seen = Math.max(0, ...runners.map(runner => runner.lastSeenAt ? runner.lastSeenAt.getTime() : 0));
      silent = !seen || now.getTime() - seen > RUNNER_SILENT_MS;
    }

    for (const comment of theirs) {
      const acks = (comment.reactions ?? []).filter(reaction => reaction.type === ACK_TYPE);
      const missed = missedBy(comment);
      if (acks.length) {
        const seats = acks.map(reaction => {
          const userId = reaction.authorId ?? reaction.author?.id ?? '';
          return { userId, name: reaction.author?.name ?? lookedUp.get(userId) ?? '', at: new Date(reaction.createdAt) };
        }).sort((a, b) => a.at.getTime() - b.at.getTime()).map(seat => ({ ...seat, at: seat.at.toISOString() }));
        result.set(comment.id, { state: 'acked', seats });
      } else if (time(comment.createdAt) < start) {
        // Written before this workspace's first ack: no line.
      } else if (waiting && notGiven(comment)) {
        result.set(comment.id, { state: 'none', seats: [], waitingFor: holder.name, reason: 'not_given' });
      } else if (holder && !done) {
        const entry: CommentAck = { state: 'waiting', seats: [], waitingFor: holder.name };
        if (openRuns.some(run => run.startedAt.getTime() <= time(comment.createdAt))) entry.reason = 'in_run';
        else if (silent) entry.reason = 'runner_silent';
        if (missed.length) entry.missed = missed;
        result.set(comment.id, entry);
      } else if (holder) {
        result.set(comment.id, { state: 'none', seats: [], waitingFor: holder.name, reason: 'issue_done' });
      } else if (missed.length) {
        result.set(comment.id, { state: 'none', seats: [], reason: 'not_holder', missed });
      }
    }
    return result;
  } catch (error) {
    report('reading the ack state failed', error);
    return new Map();
  }
}
