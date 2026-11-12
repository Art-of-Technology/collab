import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { Permission, checkUserPermission } from '@/lib/permissions';
import { setWorkspaceMembership } from '@/lib/workspace-membership';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };
const bodySchema = z.object({ active: z.boolean() }).strict();
const refusals = {
  not_found: [404, 'User or workspace not found'],
  owner: [409, 'The owner is always in their workspace'],
  agent: [409, 'Agents are managed on the Agent tokens page'],
} as const;

// PUT /api/workspaces/[workspaceId]/members/by-user/[userId] - make a person a member without an invitation, or switch them off.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ workspaceId: string; userId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
  const { workspaceId, userId } = await params;
  const access = await checkUserPermission(session.user.id, workspaceId, Permission.MANAGE_WORKSPACE_MEMBERS);
  if (!access.hasPermission) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: noStore });

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStore });

  const result = await setWorkspaceMembership({ actorId: session.user.id, workspaceId, userId, active: body.data.active });
  if (result !== 'changed' && result !== 'unchanged') {
    const [status, error] = refusals[result];
    return NextResponse.json({ error }, { status, headers: noStore });
  }
  return NextResponse.json({ active: body.data.active, changed: result === 'changed' }, { headers: noStore });
}
