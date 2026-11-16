import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { Permission, checkUserPermission } from '@/lib/permissions';
import { resolveWorkspaceSlug } from '@/lib/slug-resolvers';
import { HandoffError, agentModeSchema, agentModeState, setAgentMode } from '@/lib/agent-mode';
import { runnerSeats } from '@/lib/agent-runners';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStore });
type Params = { params: Promise<{ workspaceId: string; projectSlug: string }> };
// With the project's seats that a runner runs: whether one has fetched each seat's token, and when the seat last asked for work.
const withRunnerSeats = async <T extends object>(state: T, projectId: string) => ({ ...state, runnerSeats: await runnerSeats(prisma, projectId) });

/** The project, for a person who may manage the workspace's seats; else the answer to give instead. */
async function managedProject({ params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { refusal: reply({ error: 'Unauthorized' }, 401) };
  const { workspaceId: slugOrId, projectSlug } = await params;
  const workspaceId = await resolveWorkspaceSlug(slugOrId);
  if (!workspaceId || !(await checkUserPermission(session.user.id, workspaceId, Permission.MANAGE_WORKSPACE_PERMISSIONS)).hasPermission) {
    return { refusal: reply({ error: 'Forbidden' }, 403) };
  }
  const project = await prisma.project.findFirst({ where: { workspaceId, slug: projectSlug }, select: { id: true } });
  if (!project) return { refusal: reply({ error: 'Project not found' }, 404) };
  return { workspaceId, projectId: project.id, actorId: session.user.id };
}

// GET /api/workspaces/[workspaceId]/projects/[projectSlug]/agent-mode - how the project gives agents work, with its status groups.
export async function GET(_request: NextRequest, context: Params) {
  const found = await managedProject(context);
  return found.refusal ?? reply(await withRunnerSeats(await agentModeState(prisma, found.projectId), found.projectId));
}

// PATCH - regroup statuses, switch between handoffs and seats, carry recent claims over.
export async function PATCH(request: NextRequest, context: Params) {
  const found = await managedProject(context);
  if (found.refusal) return found.refusal;
  const body = agentModeSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return reply({ error: 'Invalid request' }, 400);
  try {
    return reply(await withRunnerSeats(await setAgentMode({ ...found, ...body.data }), found.projectId));
  } catch (error) {
    if (error instanceof HandoffError) return reply({ error: error.message, code: error.code, ...(error as { body?: object }).body }, error.status);
    throw error;
  }
}
