import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getAuthSession } from '@/lib/auth';
import { getUserWorkspaceRole, checkUserPermission, Permission } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { resolveWorkspaceSlug } from '@/lib/slug-resolvers';
import { readForgeBindings } from './reader';
import { readProjectMemory, writeProjectMemory, type MemorySnapshot } from './memory-store';
import { approveMemoryDraft, memoryDraftSchema, saveMemoryDraft, selectApprovedMemory } from './memory';

const selector = z.string().min(1).max(200);
const revision = z.string().regex(/^[a-f0-9]{40}$/).nullable();
const noteId = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const commandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), expectedSha: revision, noteId: noteId.nullable(), draft: memoryDraftSchema }).strict(),
  z.object({ action: z.literal('approve'), expectedSha: revision, noteId, revision: z.number().int().positive() }).strict(),
]);
export type MemoryCommand = z.infer<typeof commandSchema>;
export type MemoryView = { kind: 'denied' } | { kind: 'unavailable' | 'not-connected'; projectName: string } | {
  kind: 'ready'; projectName: string; snapshot: MemorySnapshot; actorId: string;
  canCreate: boolean; canEditOwn: boolean; canEditAny: boolean; canApprove: boolean;
};
export type MemoryResult = { kind: 'saved'; view: MemoryView } | { kind: 'denied' | 'invalid' | 'conflict' | 'uncertain' | 'unavailable' };

async function authorize(workspaceSlug: string, projectSlug: string) {
  if (!selector.safeParse(workspaceSlug).success || !selector.safeParse(projectSlug).success) return null;
  const session = await getAuthSession();
  if (!session?.user?.id) return null;
  const workspaceId = await resolveWorkspaceSlug(workspaceSlug);
  if (!workspaceId) return null;
  const role = await getUserWorkspaceRole(session.user.id, workspaceId);
  if (!role || !(await checkUserPermission(session.user.id, workspaceId, Permission.VIEW_NOTES)).hasPermission) return null;
  const project = await prisma.project.findFirst({ where: { workspaceId, slug: projectSlug }, select: { id: true, name: true } });
  if (!project) return null;
  const can = async (permission: Permission) => (await checkUserPermission(session.user.id, workspaceId, permission)).hasPermission;
  const [canCreate, canEditOwn, canEditAny] = await Promise.all([can(Permission.CREATE_NOTE), can(Permission.EDIT_SELF_NOTE), can(Permission.EDIT_ANY_NOTE)]);
  const binding = (await readForgeBindings()).find(item => item.workspaceId === workspaceId && item.projectId === project.id);
  return { project, binding, actorId: session.user.id, canCreate, canEditOwn, canEditAny, canApprove: role === 'OWNER' || role === 'ADMIN' };
}

export async function loadProjectMemory(workspaceSlug: string, projectSlug: string): Promise<MemoryView> {
  let projectName = 'Project memory';
  try {
    const access = await authorize(workspaceSlug, projectSlug);
    if (!access) return { kind: 'denied' };
    projectName = access.project.name;
    if (!access.binding?.memory) return { kind: 'not-connected', projectName };
    const snapshot = await readProjectMemory(access.binding);
    return { kind: 'ready', projectName, snapshot, actorId: access.actorId, canCreate: access.canCreate,
      canEditOwn: access.canEditOwn, canEditAny: access.canEditAny, canApprove: access.canApprove };
  } catch { return { kind: 'unavailable', projectName }; }
}

export async function changeProjectMemory(workspaceSlug: string, projectSlug: string, input: unknown): Promise<MemoryResult> {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) return { kind: 'invalid' };
  try {
    const access = await authorize(workspaceSlug, projectSlug);
    if (!access) return { kind: 'denied' };
    if (!access.binding?.memory) return { kind: 'unavailable' };
    const command = parsed.data;
    if (command.action === 'approve' && !access.canApprove) return { kind: 'denied' };
    if (command.action === 'save' && (command.noteId === null ? !access.canCreate : !access.canEditOwn && !access.canEditAny)) return { kind: 'denied' };
    const current = await readProjectMemory(access.binding);
    if (current.sha !== command.expectedSha) return { kind: 'conflict' };
    const existing = current.document.revisions.find(item => item.id === command.noteId);
    if (command.noteId !== null && !existing) return { kind: 'invalid' };
    if (command.action === 'save' && existing && !access.canEditAny && existing.ownerId !== access.actorId) return { kind: 'denied' };
    const actor = { id: access.actorId, canManage: command.action === 'approve' ? access.canApprove : access.canEditAny };
    const now = new Date().toISOString();
    const document = command.action === 'save'
      ? saveMemoryDraft(current.document, command.noteId ?? randomUUID(), command.draft, actor, now)
      : approveMemoryDraft(current.document, command.noteId, command.revision, actor, now);
    const result = await writeProjectMemory(access.binding, command.expectedSha, document);
    if (result.kind !== 'saved') return result;
    return { kind: 'saved', view: await loadProjectMemory(workspaceSlug, projectSlug) };
  } catch { return { kind: 'unavailable' }; }
}

export async function getApprovedProjectContext(workspaceSlug: string, projectSlug: string, relevantIds: string[]) {
  if (!z.array(noteId).max(100).safeParse(relevantIds).success) throw new Error('Invalid context selection');
  const view = await loadProjectMemory(workspaceSlug, projectSlug);
  if (view.kind !== 'ready') throw new Error('Approved project context unavailable');
  return { sha: view.snapshot.sha, revisions: selectApprovedMemory(view.snapshot.document, relevantIds) };
}
