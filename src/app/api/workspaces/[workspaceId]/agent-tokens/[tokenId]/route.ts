import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { Permission, checkUserPermission } from '@/lib/permissions';
import { z } from 'zod';
import { revokeAgentToken, setAgentWorkspaceAccess } from '@/lib/agent-tokens';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };
const accessSchema = z.object({ workspaceId: z.string().min(1).max(128), allowed: z.boolean() }).strict();

// PATCH /api/workspaces/[workspaceId]/agent-tokens/[tokenId] - let the token's agent work in another workspace, or stop it there.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ workspaceId: string; tokenId: string }> }) {
  const session = await getServerSession(authOptions);
  const actorId = session?.user?.id;
  if (!actorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
  const { workspaceId, tokenId } = await params;
  const manages = async (id: string) => (await checkUserPermission(actorId, id, Permission.MANAGE_WORKSPACE_PERMISSIONS)).hasPermission;
  if (!await manages(workspaceId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: noStore });

  const body = accessSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStore });
  const { workspaceId: targetWorkspaceId, allowed } = body.data;
  // Sending an agent into a workspace adds a member there, so it needs the same permission there. Pulling it back does not.
  if (allowed && !await manages(targetWorkspaceId)) {
    return NextResponse.json({ error: 'You need permission to manage agent tokens in that workspace too' }, { status: 403, headers: noStore });
  }

  const changed = await setAgentWorkspaceAccess({ workspaceId, actorId, tokenId, targetWorkspaceId, allowed });
  return changed
    ? NextResponse.json({ workspaceId: targetWorkspaceId, allowed }, { headers: noStore })
    : NextResponse.json({ error: 'Agent token or workspace not found' }, { status: 404, headers: noStore });
}

// DELETE /api/workspaces/[workspaceId]/agent-tokens/[tokenId] - revoke one agent token of this workspace.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ workspaceId: string; tokenId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
  const { workspaceId, tokenId } = await params;
  const access = await checkUserPermission(session.user.id, workspaceId, Permission.MANAGE_WORKSPACE_PERMISSIONS);
  if (!access.hasPermission) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: noStore });

  const revoked = await revokeAgentToken({ workspaceId, actorId: session.user.id, tokenId });
  return revoked
    ? NextResponse.json({ revoked: true }, { headers: noStore })
    : NextResponse.json({ error: 'Agent token not found' }, { status: 404, headers: noStore });
}
