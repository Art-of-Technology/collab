import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { HandoffError, renewRunnerTokens } from '@/lib/agent-runners';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

// POST /api/workspaces/[workspaceId]/agent-runners/[runnerId]/renew - revoke the tokens this runner fetched now, as
// when one may have leaked; it gets a new token for each of its seats on its next ask. A person renews their own
// runner, the workspace's owner anyone's. A signed-in person only: no agent token reaches this route.
export async function POST(request: NextRequest, { params }: { params: Promise<{ workspaceId: string; runnerId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
  // As for admitting: a page elsewhere must not be able to stop a person's seats with their session.
  if (request.headers.get('origin') !== new URL(process.env.NEXTAUTH_URL || request.url).origin || !request.headers.get('content-type')?.startsWith('application/json')) {
    return NextResponse.json({ error: 'A runner is renewed from Collab itself', code: 'same_origin' }, { status: 403, headers: noStore });
  }
  const { workspaceId, runnerId } = await params;
  try {
    return NextResponse.json(await renewRunnerTokens({ workspaceId, actorId: session.user.id, runnerId }), { headers: noStore });
  } catch (error) {
    if (error instanceof HandoffError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: noStore });
    throw error;
  }
}
