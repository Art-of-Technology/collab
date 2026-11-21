import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { handoffBody, handoffResponse } from '@/lib/agent-handoff-http';
import { HandoffError } from '@/lib/agent-seats';
import { answerRunQuestion, runAnswerSchema } from '@/lib/agent-runs';
import { authMode } from '@/lib/gateway-identity';

export async function POST(request: NextRequest, { params }: { params: Promise<{ issueId: string; runId: string }> }) {
  return handoffResponse(async () => {
    const browserSessionRequired = () => new HandoffError('browser_session_required', 'Answer from a signed-in Collab browser session', 401);
    // NextAuth's token reader also accepts bearer credentials. Require its cookie input here.
    if (authMode() !== 'nextauth' || request.headers.has('authorization')) throw browserSessionRequired();
    const configured = process.env.NEXTAUTH_URL;
    const origin = configured && URL.canParse(configured) ? new URL(configured).origin : null;
    if (!origin || origin === 'null' || request.headers.get('origin') !== origin
      || request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      throw new HandoffError('same_origin', 'Answers must be posted from Collab itself', 403);
    }
    const session = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET, secureCookie: origin.startsWith('https:') });
    if (!session?.sub) throw browserSessionRequired();
    const { issueId, runId } = await params;
    return answerRunQuestion(session.sub, issueId, runId, runAnswerSchema.parse(await handoffBody(request)));
  });
}
