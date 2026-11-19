import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handoffBody, handoffResponse } from '@/lib/agent-handoff-http';
import { HandoffError, RUNNER_STATES, fetchSeats } from '@/lib/agent-runners';

export const dynamic = 'force-dynamic';

// The columns have no check in the database, so what may be stored is decided here. A program is a short name in
// printable ASCII: it is shown to people, and it is all a runner says about what it runs.
const roomSchema = z.object({ seat: z.string().min(1).max(128), room: z.number().int().min(0).max(100),
  program: z.string().trim().min(1).max(64).regex(/^[\x20-\x7e]+$/, 'program must be printable ASCII') }).strict();
const bodySchema = z.object({
  have: z.array(z.string().min(1).max(128)).max(1000).default([]),
  state: z.enum(RUNNER_STATES).optional(),
  rooms: z.array(roomSchema).max(1000).refine(rows => new Set(rows.map(row => row.seat)).size === rows.length, 'rooms must name a seat once').optional(),
}).strict();

// POST /api/runner/seats - a runner asks, with its credential, which seats are its to run, and gets a token for
// each seat whose token it does not hold. With the ask it may report its state and the room its seats have left.
// This is all a runner credential can do.
export async function POST(request: NextRequest) {
  const response = await handoffResponse(async () => {
    const credential = /^Bearer (collab_rc_[A-Za-z0-9_-]+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
    if (!credential) throw new HandoffError('runner_refused', 'This call needs a runner credential', 401);
    const { have, ...report } = bodySchema.parse(await handoffBody(request));
    return fetchSeats(credential, have, report);
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
