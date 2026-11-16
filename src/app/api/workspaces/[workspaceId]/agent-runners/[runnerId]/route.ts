import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { HandoffError, removeRunner } from '@/lib/agent-runners';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

// DELETE /api/workspaces/[workspaceId]/agent-runners/[runnerId] - remove a runner: its credential is refused from
// now on and the tokens it fetched are revoked. A person removes their own, the workspace's owner anyone's.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ workspaceId: string; runnerId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
  const { workspaceId, runnerId } = await params;
  try {
    return NextResponse.json(await removeRunner({ workspaceId, actorId: session.user.id, runnerId }), { headers: noStore });
  } catch (error) {
    if (error instanceof HandoffError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: noStore });
    throw error;
  }
}
