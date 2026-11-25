import { NextRequest, NextResponse } from 'next/server';
import { handoffBody, handoffResponse } from '@/lib/agent-handoff-http';
import { answerStop, stopAnswerSchema } from '@/lib/agent-runs';
import { publishEvent } from '@/lib/redis';
import { getCurrentUser } from '@/lib/session';

// POST /api/issues/:issueId/runs/:runId/reply - a person answers the stop Home showed them, as a comment, while it is still open.
export async function POST(request: NextRequest, { params }: { params: Promise<{ issueId: string; runId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { issueId, runId } = await params;
  return handoffResponse(async () => {
    const { workspaceId, comment } = await answerStop(user.id, issueId, runId, stopAnswerSchema.parse(await handoffBody(request)));
    await publishEvent(`workspace:${workspaceId}:events`, { type: 'issue.comments.changed', workspaceId, issueId: comment.issueId }, 1000);
    return comment;
  });
}
