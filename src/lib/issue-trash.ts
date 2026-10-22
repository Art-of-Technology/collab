import 'server-only';
import { Prisma } from '@prisma/client';
import { issueTrashPrisma } from '@/lib/prisma';
import { assertLegacyIssueDeleteAllowed, assertLegacyProjectWriteAllowed } from '@/lib/forge/legacy-write-guard';
import { canActOnOwnContent, checkUserPermissions, Permission } from '@/lib/permissions';
import { emitIssueCreated, emitIssueDeleted } from '@/lib/event-bus';

export class IssueTrashError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export type IssueDeletionActor = {
  userId: string;
  client: 'browser' | 'app';
  appId?: string;
  installationId?: string;
};

const membership = (userId: string) => ({
  OR: [{ ownerId: userId }, { members: { some: { userId, status: true } } }],
});

export async function issueTrashScope(userId: string, workspaceId: string | null, projectId: string | null,
  db: Prisma.TransactionClient | typeof issueTrashPrisma = issueTrashPrisma) {
  if (!workspaceId || !projectId) throw new IssueTrashError(400, 'Workspace and project are required');
  const workspace = await db.workspace.findFirst({
    where: { AND: [{ OR: [{ id: workspaceId }, { slug: workspaceId }] }, membership(userId)] },
    select: { id: true, name: true, slug: true, ownerId: true,
      members: { where: { userId, status: true }, select: { role: true } } },
  });
  if (!workspace || !await db.project.findFirst({ where: { id: projectId, workspaceId: workspace.id }, select: { id: true } })) {
    throw new IssueTrashError(404, 'Project not found');
  }
  return { workspace, projectId, canPurge: workspace.ownerId === userId ||
    workspace.members.some(member => ['ADMIN', 'OWNER'].includes(member.role.toUpperCase())) };
}

export async function listIssueTrash(userId: string, workspaceId: string | null, projectId: string | null) {
  const scope = await issueTrashScope(userId, workspaceId, projectId);
  const issues = await issueTrashPrisma.issue.findMany({
    where: { workspaceId: scope.workspace.id, projectId: scope.projectId, deletedAt: { not: null } },
    select: { id: true, issueKey: true, title: true, deletedAt: true, deletedById: true },
    orderBy: [{ deletedAt: 'desc' }, { id: 'asc' }],
  });
  return { issues, canPurge: scope.canPurge };
}

export async function previewIssueTrash(userId: string, workspaceId: string, projectId: string | null, idOrKey: string) {
  const scope = await issueTrashScope(userId, workspaceId, projectId);
  const issue = await issueTrashPrisma.issue.findFirst({
    where: { workspaceId: scope.workspace.id, projectId: scope.projectId, deletedAt: null,
      OR: [{ id: idOrKey }, { issueKey: idOrKey }] },
    select: { id: true, issueKey: true, title: true, projectId: true,
      _count: { select: { comments: true, sourceRelations: true, targetRelations: true, workLogs: true } } },
  });
  if (!issue) throw new IssueTrashError(404, 'Issue not found in the selected project');
  return { id: issue.id, issueKey: issue.issueKey, title: issue.title, projectId: issue.projectId,
    counts: { issues: 1, comments: issue._count.comments,
      relations: issue._count.sourceRelations + issue._count.targetRelations, workLogs: issue._count.workLogs } };
}

export async function changeIssueTrash(input: {
  idOrKey: string;
  workspaceId: string;
  projectId: string;
  action: 'TRASHED' | 'RESTORED' | 'PURGED';
  actor: IssueDeletionActor;
  confirmIssueKey?: string;
}) {
  const { actor, action } = input;
  if (action === 'PURGED' && actor.client !== 'browser') throw new IssueTrashError(403, 'Permanent deletion requires an administrator browser session');
  const result = await issueTrashPrisma.$transaction(async tx => {
    const scope = await issueTrashScope(actor.userId, input.workspaceId, input.projectId, tx);
    const issue = await tx.issue.findFirst({
      where: { workspaceId: scope.workspace.id, projectId: scope.projectId,
        deletedAt: action === 'TRASHED' ? null : { not: null },
        OR: [{ id: input.idOrKey }, { issueKey: input.idOrKey }] },
    });
    if (!issue) throw new IssueTrashError(404, 'Issue not found in the selected project');
    if (action === 'PURGED') {
      if (!scope.canPurge) throw new IssueTrashError(403, 'Only workspace administrators can permanently delete issues');
      if (input.confirmIssueKey !== (issue.issueKey || issue.id)) throw new IssueTrashError(400, 'Type the exact issue key to permanently delete it');
    } else if (actor.client === 'browser') {
      const permissions = await checkUserPermissions(actor.userId, scope.workspace.id, [Permission.DELETE_ANY_TASK, Permission.DELETE_SELF_TASK]);
      if (!canActOnOwnContent(issue.reporterId ?? '', actor.userId, permissions[Permission.DELETE_ANY_TASK].hasPermission,
        permissions[Permission.DELETE_SELF_TASK].hasPermission)) throw new IssueTrashError(403, 'No permission to change this issue in Trash');
    }
    // Check retained bindings too: normal queries intentionally cannot see trashed issues.
    await assertLegacyProjectWriteAllowed(issue.projectId);
    await assertLegacyIssueDeleteAllowed(issue.id);
    const now = new Date();
    if (action === 'PURGED') {
      await tx.issue.delete({ where: { id: issue.id, deletedAt: { not: null }, updatedAt: issue.updatedAt } });
    } else {
      await tx.issue.update({ where: { id: issue.id, updatedAt: issue.updatedAt, deletedAt: issue.deletedAt },
        data: { deletedAt: action === 'TRASHED' ? now : null, deletedById: action === 'TRASHED' ? actor.userId : null } });
    }
    await tx.issueDeletionAudit.create({ data: {
      issueId: issue.id, issueKey: issue.issueKey, title: issue.title, workspaceId: issue.workspaceId,
      projectId: issue.projectId, action, actorId: actor.userId, client: actor.client,
      appId: actor.appId, installationId: actor.installationId, createdAt: now,
    } });
    await tx.issueActivity.create({ data: {
      itemId: issue.id, itemType: 'ISSUE', action, userId: actor.userId, workspaceId: issue.workspaceId,
      projectId: issue.projectId, details: JSON.stringify({ issueKey: issue.issueKey, title: issue.title,
        client: actor.client, appId: actor.appId, installationId: actor.installationId }),
    } });
    return { issue, workspace: scope.workspace };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  // Search and webhook events describe a committed transition only.
  const metadata = { userId: actor.userId, workspaceId: result.workspace.id,
    workspaceName: result.workspace.name, workspaceSlug: result.workspace.slug,
    source: actor.client === 'app' ? 'mcp-api' : 'api' };
  if (action === 'RESTORED') {
    await emitIssueCreated({ ...result.issue, deletedAt: null, deletedById: null }, metadata, { async: true }).catch(() => {});
  } else {
    await emitIssueDeleted(result.issue, metadata, { async: true }).catch(() => {});
  }
  return { id: result.issue.id, issueKey: result.issue.issueKey, title: result.issue.title };
}

export async function assertNoRetainedIssues(where: Prisma.IssueWhereInput) {
  if (await issueTrashPrisma.issue.count({ where })) {
    throw new IssueTrashError(409, 'This project or workspace still contains issues, including Trash. Move them or have an administrator permanently delete them first.');
  }
}
