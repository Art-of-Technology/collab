import { NextRequest, NextResponse } from 'next/server';
import { handoffResponse } from '@/lib/agent-handoff-http';
import { clearRun } from '@/lib/agent-runs';
import { getCurrentUser } from '@/lib/session';

// POST /api/issues/:issueId/runs/:runId/clear - a person confirms a lost run's session is gone.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ issueId: string; runId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { issueId, runId } = await params;
  return handoffResponse(() => clearRun(user.id, issueId, runId));
}
