import type { Prisma } from '@prisma/client';
import { earlyAnswers } from '@/lib/agent-stop-boundary';
import type { prisma } from '@/lib/prisma';

type DB = Prisma.TransactionClient | typeof prisma;

/**
 * Where an issue's "comments since" window opens: the end of its last finished run, or, when that run named a person who
 * answered before it finished (`earlyAnswers`), that answer. Nothing before any run has finished.
 */
export async function contextSince(db: DB, issueId: string): Promise<{ gt?: Date; gte?: Date } | undefined> {
  const last = await db.agentRun.findFirst({ where: { issueId, state: 'finished' }, orderBy: { endedAt: 'desc' },
    select: { id: true, startedAt: true, endedAt: true, userId: true, seat: { select: { name: true } } } });
  if (!last?.endedAt) return undefined;
  const entry = await db.issueActivity.findFirst({ where: { itemType: 'ISSUE', itemId: issueId, action: 'AGENT_RUN_FINISHED' }, orderBy: { createdAt: 'desc' }, select: { details: true } });
  const facts = JSON.parse(entry?.details ?? '{}');
  const answer = last.seat && facts.runId === last.id && typeof facts.askedUser === 'string'
    ? (await earlyAnswers(db, [{ issueId, seatUserId: last.userId, startedAt: last.startedAt, endedAt: last.endedAt }])).get(issueId) : undefined;
  return answer ? { gte: answer } : { gt: last.endedAt };
}
