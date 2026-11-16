import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handoffBody, handoffResponse } from '@/lib/agent-handoff-http';
import { HandoffError, fetchSeats } from '@/lib/agent-runners';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ have: z.array(z.string().min(1).max(128)).max(1000).default([]) }).strict();

// POST /api/runner/seats - a runner asks, with its credential, which seats are its to run, and gets a token for
// each seat whose token it does not hold. This is all a runner credential can do.
export async function POST(request: NextRequest) {
  const response = await handoffResponse(async () => {
    const credential = /^Bearer (collab_rc_[A-Za-z0-9_-]+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
    if (!credential) throw new HandoffError('runner_refused', 'This call needs a runner credential', 401);
    return fetchSeats(credential, bodySchema.parse(await handoffBody(request)).have);
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
