import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { customRoleRefusal, deleteCustomRole, updateCustomRole } from '@/lib/agent-custom-roles';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };
// The base role is not here: the seats that have the role keep the base role they were made with.
const bodySchema = z.object({ name: z.string().max(1_000).optional(), instructions: z.string().max(64_000).optional(), retired: z.boolean().optional() }).strict();

type Params = { params: Promise<{ workspaceId: string; roleId: string }> };

// PATCH /api/workspaces/[workspaceId]/agent-custom-roles/[roleId] - change a role's name or instructions, or retire it so
// no new seat takes it (CLB-626). Requires MANAGE_AGENTS.
export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
  const { workspaceId, roleId } = await params;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStore });

  const result = await updateCustomRole(session.user.id, workspaceId, roleId, body.data);
  if ('role' in result) return NextResponse.json({ role: result.role }, { headers: noStore });
  const { status, body: refused } = customRoleRefusal(result);
  return NextResponse.json(refused, { status, headers: noStore });
}

// DELETE /api/workspaces/[workspaceId]/agent-custom-roles/[roleId] - delete a role no seat has; one with seats is retired instead.
export async function DELETE(_request: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
  const { workspaceId, roleId } = await params;

  const result = await deleteCustomRole(session.user.id, workspaceId, roleId);
  if ('deleted' in result) return NextResponse.json({ deleted: result.deleted }, { headers: noStore });
  const { status, body: refused } = customRoleRefusal(result);
  return NextResponse.json(refused, { status, headers: noStore });
}
