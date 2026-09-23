import 'server-only';
import { getAuthSession } from '@/lib/auth';
import { getUserWorkspaceRole } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { resolveWorkspaceSlug } from '@/lib/slug-resolvers';
import { readForgeBindings, readForgeIssues } from './reader';
import type { ForgeTask } from './tasks';

export type ForgeBoard =
  | { kind: 'denied' }
  | { kind: 'not-connected' | 'unavailable'; projectName: string }
  | { kind: 'ready'; projectName: string; tasks: ForgeTask[]; truncated: boolean; fetchedAt: string; today: string };

export async function loadForgeBoard(workspaceSlug: string, projectSlug: string): Promise<ForgeBoard> {
  if (typeof workspaceSlug !== 'string' || typeof projectSlug !== 'string' ||
    !workspaceSlug || !projectSlug || workspaceSlug.length > 200 || projectSlug.length > 200) return { kind: 'denied' };
  const session = await getAuthSession();
  if (!session?.user?.id) return { kind: 'denied' };
  const workspaceId = await resolveWorkspaceSlug(workspaceSlug);
  if (!workspaceId || !await getUserWorkspaceRole(session.user.id, workspaceId)) return { kind: 'denied' };
  const project = await prisma.project.findFirst({
    where: { workspaceId, slug: projectSlug }, select: { id: true, name: true },
  });
  if (!project) return { kind: 'denied' };
  try {
    const binding = (await readForgeBindings()).find(item => item.workspaceId === workspaceId && item.projectId === project.id);
    if (!binding) return { kind: 'not-connected', projectName: project.name };
    const result = await readForgeIssues(binding);
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const today = ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
    return { kind: 'ready', projectName: project.name, ...result, today };
  } catch {
    // Never expose provider response bodies, configured paths or credentials.
    return { kind: 'unavailable', projectName: project.name };
  }
}
