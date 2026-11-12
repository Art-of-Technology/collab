import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { Permission, checkUserPermission } from '@/lib/permissions';
import { revokeAgentToken } from '@/lib/agent-tokens';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

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
