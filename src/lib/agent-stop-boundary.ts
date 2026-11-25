import type { Prisma } from '@prisma/client';
import type { prisma } from '@/lib/prisma';

/**
 * Declared stops: for each run that stopped naming a person, the time after which a comment by somebody else answers
 * it. A seat writes its question as a comment and finishes a moment later, so that is the seat's last comment of the
 * run, and the finish when it wrote none in it. One rule for the seat's inbox, Home, an answer sent from Home and the
 * next run's context, so none of them counts an answer the others do not. Whether a run named a person is the caller's
 * to know. Keyed by issue: one run per issue.
 */
export async function stopBoundaries(db: Prisma.TransactionClient | typeof prisma, stops: { issueId: string; seatUserId: string; startedAt: Date; endedAt: Date }[]) {
  const asked = new Map((stops.length ? await db.issueComment.groupBy({ by: ['issueId'], _max: { createdAt: true },
    where: { OR: stops.map(stop => ({ issueId: stop.issueId, authorId: stop.seatUserId, createdAt: { gte: stop.startedAt, lte: stop.endedAt } })) } }) : [])
    .map(row => [row.issueId, row._max.createdAt]));
  return new Map(stops.map(stop => [stop.issueId, asked.get(stop.issueId) ?? stop.endedAt]));
}
