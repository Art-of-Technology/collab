import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';

type LabelledIssue = { id: string; workspaceId: string; projectId: string; issueKey: string | null; labels: { id: string }[] };
export class InvalidIssueLabels extends Error {}

/** Call inside the issue write transaction, with labels read before that write.
 * Updates must use serializable isolation so concurrent label edits cannot fan out twice.
 */
export async function enqueueLabelHandoff(db: Prisma.TransactionClient, userId: string,
  issue: LabelledIssue, previousLabelIds: string[]) {
  const labelIds = [...new Set(issue.labels.map(label => label.id))];
  if (!labelIds.length) return;
  const labels = await db.taskLabel.findMany({ where: { id: { in: labelIds }, workspaceId: issue.workspaceId }, select: { id: true } });
  if (labels.length !== labelIds.length) throw new InvalidIssueLabels('Labels must belong to the issue workspace');
  const added = labelIds.filter(id => !previousLabelIds.includes(id));
  if (!added.length) return;
  const subscribers = await db.agentRegistration.findMany({
    where: { workspaceId: issue.workspaceId, labelIds: { hasSome: added } }, select: { labelIds: true },
  });
  const subscribed = new Set(subscribers.flatMap(agent => agent.labelIds));
  const routed = added.filter(id => subscribed.has(id));
  if (!routed.length) return;
  // One handoff for this edit: all role subscribers compete for the same claim.
  // Descriptions are fetched with current issue access when the agent takes work.
  const content = `Subscribed labels were added to ${issue.issueKey || issue.id}. Read the current issue, comments and timeline; claim this handoff before working. Labels: ${routed.join(', ')}.`;
  const handoff = await db.agentHandoff.create({ data: {
    workspaceId: issue.workspaceId, issueId: issue.id, sourceKey: `labels:${randomUUID()}`,
    kind: 'label_added', content, labelIds: routed, recipientNames: [],
  } });
  await db.issueActivity.create({ data: {
    itemType: 'ISSUE', itemId: issue.id, workspaceId: issue.workspaceId, projectId: issue.projectId,
    userId, action: 'AGENT_LABEL_ADDED', details: JSON.stringify({ handoffId: handoff.id, toLabels: routed, content }),
  } });
  return handoff;
}
