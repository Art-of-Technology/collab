import { NextRequest, NextResponse } from 'next/server';
import { handoffResponse } from '@/lib/agent-handoff-http';
import { openRun } from '@/lib/agent-runs';
import { authMode } from '@/lib/gateway-identity';
import { getCurrentUser } from '@/lib/session';

// GET /api/issues/:issueId/runs - the run that is open on the issue, for its page.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ issueId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const reply = await handoffResponse(async () => openRun(user.id, (await params).issueId, authMode() === 'nextauth'));
  reply.headers.set('Cache-Control', 'private, no-store');
  return reply;
}
