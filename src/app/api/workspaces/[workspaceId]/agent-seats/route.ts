import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { Permission, checkUserPermission } from '@/lib/permissions';
import { HandoffError, SEAT_ROLES, createSeat } from '@/lib/agent-seats';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };
const bodySchema = z.object({
  name: z.string().trim().min(1).max(50),
  projectId: z.string().min(1).max(128),
  role: z.enum(SEAT_ROLES),
  ownerId: z.string().min(1).max(128).nullable().default(null),
  expiresInDays: z.number().int().min(1).max(365).default(90),
  isDefault: z.boolean().optional(),
}).strict();

// POST /api/workspaces/[workspaceId]/agent-seats - create a seat with its first token; the token is returned once.
export async function POST(request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
  const { workspaceId } = await params;
  const access = await checkUserPermission(session.user.id, workspaceId, Permission.MANAGE_WORKSPACE_PERMISSIONS);
  if (!access.hasPermission) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: noStore });

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStore });

  try {
    const result = await createSeat({ workspaceId, actorId: session.user.id, ...body.data });
    if (result.error) {
      const [status, error] = ({
        not_found: [404, 'Workspace not found'],
        paused: [409, 'This agent was switched off or removed and still has usable tokens. Revoke them, or switch its member back on, before creating a seat.'],
        unavailable: [503, 'Agent tokens are not set up on this deployment'],
      } as const)[result.error];
      return NextResponse.json({ error }, { status, headers: noStore });
    }
    return NextResponse.json(result, { status: 201, headers: noStore });
  } catch (error) {
    if (error instanceof HandoffError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: noStore });
    throw error;
  }
}
