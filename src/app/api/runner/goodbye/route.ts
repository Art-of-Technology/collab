import { NextRequest } from 'next/server';
import { handoffResponse } from '@/lib/agent-handoff-http';
import { HandoffError, runnerGoodbye } from '@/lib/agent-runners';

export const dynamic = 'force-dynamic';

// POST /api/runner/goodbye - a runner says it is going, as its last act before its machine is deleted: the tokens it
// fetched are revoked at once and its credential is refused from now on. It takes no body.
export async function POST(request: NextRequest) {
  const response = await handoffResponse(async () => {
    const credential = /^Bearer (collab_rc_[A-Za-z0-9_-]+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
    if (!credential) throw new HandoffError('runner_refused', 'This call needs a runner credential', 401);
    return runnerGoodbye(credential);
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
