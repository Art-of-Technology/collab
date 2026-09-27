import 'server-only';
import { z } from 'zod';
import { getAuthSession } from '@/lib/auth';
import { checkUserPermission, getUserWorkspaceRole, Permission } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { resolveWorkspaceSlug } from '@/lib/slug-resolvers';
import { readForgeBindings } from './reader';
import { issueChanges, issueDescription, splitIssueBody } from './issue-content';
import { taskStatuses, taskPriorities, type TaskStatus, type TaskPriority } from './tasks';
import { readForgeIssue, writeForgeIssue, type IssueSnapshot, type IssueWriteResult } from './issue-store';

const selector = z.string().min(1).max(200);
const number = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const expected = z.string().regex(/^[a-f0-9]{64}$/);
const body = z.string().min(1).max(32000);
const commandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('edit'), number, expected, changes: issueChanges }).strict(),
  z.object({ action: z.literal('create'), title: z.string().trim().min(1).max(200), description: issueDescription }).strict(),
  z.object({ action: z.literal('comment'), number, body }).strict(),
  z.object({ action: z.literal('edit-comment'), number, commentId: number, expected, body }).strict(),
]);
export type IssueRights = { canCreate: boolean; canEdit: boolean; canStatus: boolean; canAssign: boolean; canComment: boolean; canEditComment: boolean };
export type IssueFields = { title: string; description: string; status: string; priority: string; owner: string; dueDate: string; followUpDate: string; nextAction: string };
export type IssueView = { kind: 'ready'; snapshot: IssueSnapshot; rights: IssueRights; bodyWarning: boolean; fields: IssueFields } | { kind: 'denied' | 'unavailable' };
export type IssueResult = IssueWriteResult | { kind: 'denied' | 'unavailable' };

async function authorize(workspaceSlug: string, projectSlug: string) {
  if (!selector.safeParse(workspaceSlug).success || !selector.safeParse(projectSlug).success) return null;
  const session = await getAuthSession();
  if (!session?.user?.id) return null;
  const workspaceId = await resolveWorkspaceSlug(workspaceSlug);
  if (!workspaceId || !await getUserWorkspaceRole(session.user.id, workspaceId)) return null;
  const can = async (permission: Permission) => (await checkUserPermission(session.user.id, workspaceId, permission)).hasPermission;
  if (!await can(Permission.VIEW_TASKS)) return null;
  const project = await prisma.project.findFirst({ where: { workspaceId, slug: projectSlug }, select: { id: true } });
  if (!project) return null;
  const [canCreate, canEdit, canStatus, canAssign, canComment, canEditComment] = await Promise.all([
    can(Permission.CREATE_TASK), can(Permission.EDIT_ANY_TASK), can(Permission.CHANGE_TASK_STATUS),
    can(Permission.ASSIGN_TASK), can(Permission.COMMENT_ON_TASK), can(Permission.EDIT_ANY_COMMENT),
  ]);
  return { project, workspaceId, rights: { canCreate, canEdit, canStatus, canAssign, canComment, canEditComment } };
}

async function bindingFor(workspaceId: string, projectId: string) {
  return (await readForgeBindings()).find(item => item.workspaceId === workspaceId && item.projectId === projectId);
}

export async function loadForgeIssue(workspaceSlug: string, projectSlug: string, issueNumber: number): Promise<IssueView> {
  if (!number.safeParse(issueNumber).success) return { kind: 'denied' };
  try {
    const access = await authorize(workspaceSlug, projectSlug);
    if (!access) return { kind: 'denied' };
    const binding = await bindingFor(access.workspaceId, access.project.id);
    if (!binding) return { kind: 'unavailable' };
    const snapshot = await readForgeIssue(binding, issueNumber);
    if (!binding.issues) for (const key of Object.keys(access.rights) as (keyof IssueRights)[]) access.rights[key] = false;
    let bodyWarning = false;
    let description = snapshot.issue.body ?? '', metadata: Record<string, unknown> = {};
    try {
      const parsed = splitIssueBody(description);
      description = parsed.before + parsed.after;
      metadata = parsed.metadata;
    } catch { bodyWarning = true; }
    const field = (key: string) => typeof metadata[key] === 'string' ? metadata[key] as string : '';
    const fields = { title: snapshot.issue.title, description, status: snapshot.issue.state === 'closed' ? 'done' : taskStatuses.includes(metadata.status as TaskStatus) && metadata.status !== 'done' ? String(metadata.status) : 'backlog',
      priority: taskPriorities.includes(metadata.priority as TaskPriority) ? String(metadata.priority) : 'normal',
      owner: field('owner'), dueDate: field('dueDate'), followUpDate: field('followUpDate'), nextAction: field('nextAction') };
    snapshot.comments = snapshot.comments.map(comment => ({ ...comment, canEdit: comment.canEdit && access.rights.canEditComment }));
    return { kind: 'ready', snapshot, rights: access.rights, bodyWarning, fields };
  } catch { return { kind: 'unavailable' }; }
}

export async function loadForgeIssueRights(workspaceSlug: string, projectSlug: string): Promise<IssueRights | null> {
  try {
    const access = await authorize(workspaceSlug, projectSlug);
    if (!access) return null;
    const binding = await bindingFor(access.workspaceId, access.project.id);
    if (!binding?.issues) for (const key of Object.keys(access.rights) as (keyof IssueRights)[]) access.rights[key] = false;
    return access.rights;
  } catch { return null; }
}

export async function changeForgeIssue(workspaceSlug: string, projectSlug: string, input: unknown): Promise<IssueResult> {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) return { kind: 'invalid' };
  try {
    const access = await authorize(workspaceSlug, projectSlug);
    if (!access) return { kind: 'denied' };
    const command = parsed.data, rights = access.rights;
    if (command.action === 'create' && !rights.canCreate || command.action === 'comment' && !rights.canComment ||
      command.action === 'edit-comment' && !rights.canEditComment) return { kind: 'denied' };
    if (command.action === 'edit') {
      for (const key of Object.keys(command.changes)) {
        if (!(key === 'status' ? rights.canStatus : key === 'owner' ? rights.canAssign : rights.canEdit)) return { kind: 'denied' };
      }
    }
    const binding = await bindingFor(access.workspaceId, access.project.id);
    if (!binding?.issues) return { kind: 'unavailable' };
    return await writeForgeIssue(binding, command);
  } catch { return { kind: 'unavailable' }; }
}
