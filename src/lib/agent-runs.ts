import { prisma } from '@/lib/prisma';
import { seatFor } from '@/lib/agent-seats';
import type { AppAuthContext } from '@/lib/apps/auth-middleware';

export const INBOX_LIMIT = 50;
const PRIORITIES = ['urgent', 'high', 'medium', 'low'];
/** Inbox order: issues to resume, in review with something new, blocked with something new, then the rest. */
const ORDER: Record<string, number> = { resume: 0, in_review: 1, blocked: 2 };

export interface InboxItem {
  issueId: string; issueKey: string | null; title: string; priority: string; category: string;
  reason: 'resume' | 'review_returned' | 'reply' | 'blocker_resolved' | 'assigned'; lastRunAt: string | null;
}

type Status = { category: string | null; isFinal: boolean } | null;
/** The group of a status. One made after the backfill has none: it reads as done when final, otherwise as to do. */
const categoryOf = (status: Status) => status?.category ?? (status?.isFinal ? 'done' : 'todo');
const isDone = (issue: { projectStatus: Status }) => categoryOf(issue.projectStatus) === 'done';
const statusSelect = { select: { category: true, isFinal: true } } as const;

/**
 * What the caller should work on next: the issues assigned to it, and for a seat only those of its project.
 * Never an issue with a run open, and never one whose status is in the done group. Where an issue stands is
 * read from its last run (resume when it ended without finishing, else its outcome); the status group speaks
 * for an issue that never had a run or whose last run finished done. A run that ended before the issue was
 * last assigned to the caller says nothing: the assignment is new work. An issue in review or blocked is
 * offered only when something happened after its reference time: the end of that run, or without one the
 * time it was last assigned to the caller.
 */
export async function seatInbox(context: Pick<AppAuthContext, 'user' | 'workspace'>): Promise<{ items: InboxItem[] }> {
  const me = context.user.id;
  const seat = await seatFor(prisma, context);
  if (seat) {
    await prisma.agentSeat.updateMany({
      where: { id: seat.id, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: new Date(Date.now() - 60_000) } }] }, data: { lastSeenAt: new Date() },
    });
  }
  const issues = await prisma.issue.findMany({
    where: {
      workspaceId: context.workspace.id, assigneeId: me, ...(seat && { projectId: seat.projectId }),
      OR: [{ statusId: null }, { projectStatus: { OR: [{ category: { not: 'done' } }, { category: null, isFinal: false }] } }],
    },
    select: {
      id: true, issueKey: true, title: true, priority: true, createdAt: true, projectStatus: statusSelect,
      helpers: { where: { userId: me }, select: { assignedAt: true, approvedAt: true } },
      // One run at most is open per issue, and no run starts while it is, so an open run is always the latest.
      agentRuns: { orderBy: { startedAt: 'desc' }, take: 1, select: { outcome: true, endedAt: true } },
    },
  });
  const candidates = issues.flatMap(issue => {
    const last = issue.agentRuns[0];
    if (last && !last.endedAt) return [];
    const category = categoryOf(issue.projectStatus);
    // Every path that assigns writes this row and stamps it again on a later assignment.
    const assigned = issue.helpers[0]?.approvedAt ?? issue.helpers[0]?.assignedAt ?? issue.createdAt;
    const run = last?.endedAt && last.endedAt >= assigned ? last : undefined;
    const stands = !run || run.outcome === 'done' ? category : run.outcome ?? 'resume';
    return [{ issue, last, stands, category: stands === 'resume' ? category : stands, since: run?.endedAt ?? assigned }];
  });

  const waiting = candidates.filter(({ stands }) => stands === 'in_review' || stands === 'blocked').map(({ issue }) => issue.id);
  const replies = { where: { authorId: { not: me } }, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } } as const;
  const linked = { select: { agentRequestRole: true, reporterId: true, updatedAt: true, projectStatus: statusSelect, comments: replies } } as const;
  const details = new Map((waiting.length ? await prisma.issue.findMany({ where: { id: { in: waiting } }, select: {
    id: true, comments: replies,
    sourceRelations: { select: { relationType: true, targetIssue: linked } },
    targetRelations: { select: { relationType: true, sourceIssue: linked } },
  } }) : []).map(detail => [detail.id, detail]));

  const reasonFor = ({ issue, stands, since }: typeof candidates[number]): InboxItem['reason'] | null => {
    if (stands === 'resume') return 'resume';
    if (stands !== 'in_review' && stands !== 'blocked') return 'assigned';
    const detail = details.get(issue.id);
    if (!detail) return null;
    const after = (date?: Date) => !!date && date > since;
    // shortcut: an issue's last change stands for the time it reached done, so editing a blocker or a review request
    // that was already done offers the waiting issue once more; read the status change itself once every path records one.
    const doneAfter = (other: { projectStatus: Status; updatedAt: Date }) => isDone(other) && after(other.updatedAt);
    const others = [
      ...detail.sourceRelations.map(relation => ({ blocksMe: relation.relationType === 'BLOCKED_BY', issue: relation.targetIssue })),
      ...detail.targetRelations.map(relation => ({ blocksMe: relation.relationType === 'BLOCKS', issue: relation.sourceIssue })),
    ];
    // A request is known by the field only filing one sets, and it is the caller's when the caller reported it.
    const requests = others.map(other => other.issue).filter(other => other.agentRequestRole && other.reporterId === me);
    if (stands === 'in_review') {
      if (requests.some(request => request.agentRequestRole === 'review' && doneAfter(request))) return 'review_returned';
      return after(detail.comments[0]?.createdAt) ? 'reply' : null;
    }
    const blockers = others.filter(other => other.blocksMe).map(other => other.issue);
    if (blockers.length && blockers.every(isDone) && blockers.some(doneAfter)) return 'blocker_resolved';
    return [detail, ...requests].some(other => after(other.comments[0]?.createdAt)) ? 'reply' : null;
  };
  const rank = (priority: string) => (PRIORITIES.indexOf(priority.toLowerCase()) + PRIORITIES.length + 1) % (PRIORITIES.length + 1);

  return { items: candidates
    .flatMap(candidate => { const reason = reasonFor(candidate); return reason ? [{ ...candidate, reason }] : []; })
    .sort((a, b) => (ORDER[a.stands] ?? 3) - (ORDER[b.stands] ?? 3) || rank(a.issue.priority) - rank(b.issue.priority)
      || a.issue.createdAt.getTime() - b.issue.createdAt.getTime())
    .slice(0, INBOX_LIMIT)
    .map(({ issue, last, category, reason }) => ({ issueId: issue.id, issueKey: issue.issueKey, title: issue.title, priority: issue.priority,
      category, reason, lastRunAt: last?.endedAt?.toISOString() ?? null })) };
}
