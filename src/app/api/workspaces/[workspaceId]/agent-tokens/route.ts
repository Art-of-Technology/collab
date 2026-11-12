import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { Permission, checkUserPermission } from '@/lib/permissions';
import { createAgentToken } from '@/lib/agent-tokens';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };
const bodySchema = z.object({
  name: z.string().trim().min(1).max(50),
  access: z.enum(['read', 'write']).default('read'),
  expiresInDays: z.number().int().min(1).max(365).default(90),
}).strict();

// POST /api/workspaces/[workspaceId]/agent-tokens - mint a named agent token; the token is returned once.
export async function POST(request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
  const { workspaceId } = await params;
  const access = await checkUserPermission(session.user.id, workspaceId, Permission.MANAGE_WORKSPACE_PERMISSIONS);
  if (!access.hasPermission) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: noStore });

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStore });

  const result = await createAgentToken({ workspaceId, actorId: session.user.id, ...body.data });
  if ('error' in result) {
    return result.error === 'not_found'
      ? NextResponse.json({ error: 'Workspace not found' }, { status: 404, headers: noStore })
      : NextResponse.json({ error: 'Agent tokens are not set up on this deployment' }, { status: 503, headers: noStore });
  }
  return NextResponse.json(result, { status: 201, headers: noStore });
}
