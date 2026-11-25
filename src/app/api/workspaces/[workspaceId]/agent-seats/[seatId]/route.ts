import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { Permission, checkUserPermission } from '@/lib/permissions';
import { HandoffError, retireSeat } from '@/lib/agent-seats';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

// DELETE /api/workspaces/[workspaceId]/agent-seats/[seatId] - retire a seat; answers with the issues it gave up.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ workspaceId: string; seatId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
  const { workspaceId, seatId } = await params;
  const access = await checkUserPermission(session.user.id, workspaceId, Permission.MANAGE_AGENTS);
  if (!access.hasPermission) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: noStore });

  try {
    return NextResponse.json(await retireSeat({ workspaceId, actorId: session.user.id, seatId }), { headers: noStore });
  } catch (error) {
    if (error instanceof HandoffError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: noStore });
    throw error;
  }
}
