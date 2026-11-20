import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handoffBody, handoffResponse } from '@/lib/agent-handoff-http';
import { HandoffError, RUNNER_STATES, fetchSeats } from '@/lib/agent-runners';

export const dynamic = 'force-dynamic';

// The columns have no check in the database, so what may be stored is decided here. A program is a short name in
// printable ASCII: it is shown to people, and it is all a runner says about what it runs.
const program = z.string().trim().min(1).max(64).regex(/^[\x20-\x7e]+$/, 'program must be printable ASCII');
const roomSchema = z.object({ seat: z.string().min(1).max(128), room: z.number().int().min(0).max(100), program }).strict();
const endedSchema = z.object({ run: z.string().min(1).max(128), program }).strict();
const bodySchema = z.object({
  have: z.array(z.string().min(1).max(128)).max(1000).default([]),
  state: z.enum(RUNNER_STATES).optional(),
  rooms: z.array(roomSchema).max(1000).refine(rows => new Set(rows.map(row => row.seat)).size === rows.length, 'rooms must name a seat once').optional(),
  ended: z.array(endedSchema).max(100).refine(rows => new Set(rows.map(row => row.run)).size === rows.length, 'ended must name a run once').optional(),
}).strict();

// POST /api/runner/seats - a runner asks, with its credential, which seats are its to run, and gets a token for
// each seat whose token it does not hold. With the ask it may report its state, the room its seats have left and
// the program each run that ended used.
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
