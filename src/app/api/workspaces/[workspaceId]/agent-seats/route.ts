import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { Permission, checkUserPermission } from '@/lib/permissions';
import { HandoffError, SEAT_ROLES, createSeat } from '@/lib/agent-seats';
import { agentMintErrors } from '@/lib/agent-tokens';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };
const bodySchema = z.object({
  name: z.string().trim().min(1).max(50),
  // One project (the default), or the whole workspace (CLB-613): such a seat names no project.
  scope: z.enum(['project', 'workspace']).default('project'),
  projectId: z.string().min(1).max(128).optional(),
  role: z.string().refine(role => SEAT_ROLES.includes(role)).optional(),
  // The workspace's own role (CLB-628), in place of a built-in one: the seat behaves like its base role.
  customRoleId: z.string().min(1).max(128).optional(),
  ownerId: z.string().min(1).max(128).nullable().default(null),
  expiresInDays: z.number().int().min(1).max(365).default(90),
  isDefault: z.boolean().optional(),
  byRunner: z.boolean().optional(),
  // The seat's own pick among its project's repositories, where the project has several.
  repositoryId: z.string().min(1).max(128).optional(),
}).strict().refine(body => (body.role === undefined) !== (body.customRoleId === undefined))
  .refine(body => (body.scope === 'workspace') === (body.projectId === undefined));

// POST /api/workspaces/[workspaceId]/agent-seats - create a seat with its first token; the token is returned once.
// With `byRunner` no token is made: the owner's runner fetches it, and `token` is null.
export async function POST(request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
  const { workspaceId } = await params;
  const access = await checkUserPermission(session.user.id, workspaceId, Permission.MANAGE_AGENTS);
  if (!access.hasPermission) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: noStore });

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStore });
  const { scope, projectId, ...seat } = body.data;
  // A workspace seat reaches every project of the workspace: only who manages the workspace's permissions makes one.
  if (scope === 'workspace' && !(await checkUserPermission(session.user.id, workspaceId, Permission.MANAGE_WORKSPACE_PERMISSIONS)).hasPermission) {
    return NextResponse.json({ error: 'Only someone who may manage the workspace\'s permissions can create a seat for the whole workspace', code: 'workspace_scope_forbidden' },
      { status: 403, headers: noStore });
  }

  try {
    const result = await createSeat({ workspaceId, actorId: session.user.id, projectId: projectId ?? null, ...seat });
    if (result.error) {
      const [status, error] = ({
        ...agentMintErrors,
        paused: [409, 'This agent was switched off or removed and still has usable tokens. Revoke them before creating a seat.'],
      } as const)[result.error];
      return NextResponse.json({ error }, { status, headers: noStore });
    }
    return NextResponse.json(result, { status: 201, headers: noStore });
  } catch (error) {
    if (error instanceof HandoffError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: noStore });
    throw error;
  }
}
