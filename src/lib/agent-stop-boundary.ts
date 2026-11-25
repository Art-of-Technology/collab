import type { Prisma } from '@prisma/client';
import type { prisma } from '@/lib/prisma';

/** An account a person signs in with: it has an email and is no seat's. An agent's account has no email. */
const PERSON = { email: { not: null }, agentSeat: { is: null } } as const;

/**
 * Declared stops: the runs that stopped naming a person and were answered before they finished, each with the time of
 * that answer. A seat writes its question as a comment and finishes a moment later, so a person's comment that is later
 * than the seat's last comment of the run answers it, also when it came before the finish. Only a person's: what another
 * seat or an agent wrote in that time is not the answer of the person who was asked. A run in which the seat wrote no
 * comment has no such time. After the finish any comment but the seat's own answers, as it always did: that is not read
 * here. One rule for the seat's inbox, Home, an answer sent from Home and the next run's context, so none of them
 * counts an answer the others do not. Whether a run named a person is the caller's to know. Keyed by issue: one run each.
 */
export async function earlyAnswers(db: Prisma.TransactionClient | typeof prisma, stops: { issueId: string; seatUserId: string; startedAt: Date; endedAt: Date }[]) {
  const asked = stops.length ? await db.issueComment.groupBy({ by: ['issueId'], _max: { createdAt: true },
    where: { OR: stops.map(stop => ({ issueId: stop.issueId, authorId: stop.seatUserId, createdAt: { gte: stop.startedAt, lte: stop.endedAt } })) } }) : [];
  const byIssue = new Map(stops.map(stop => [stop.issueId, stop]));
  const open = asked.flatMap(({ issueId, _max }) => {
    const stop = byIssue.get(issueId)!;
    return _max.createdAt ? [{ issueId, authorId: { not: stop.seatUserId }, createdAt: { gt: _max.createdAt, lte: stop.endedAt } }] : [];
  });
  const answers = open.length ? await db.issueComment.groupBy({ by: ['issueId'], _min: { createdAt: true }, where: { author: PERSON, OR: open } }) : [];
  return new Map(answers.flatMap(row => row._min.createdAt ? [[row.issueId, row._min.createdAt] as const] : []));
}

/**
 * When an issue was last given to its assignee: every path that assigns writes this row and stamps it again on a later
 * assignment. A run that ended before then no longer says where the issue stands, so it is no stop to show or answer.
 */
export function lastAssigned(issue: { assigneeId: string | null; createdAt: Date; helpers: { userId: string; approvedAt: Date | null; assignedAt: Date }[] }) {
  const row = issue.helpers.find(helper => helper.userId === issue.assigneeId);
  return row?.approvedAt ?? row?.assignedAt ?? issue.createdAt;
}
