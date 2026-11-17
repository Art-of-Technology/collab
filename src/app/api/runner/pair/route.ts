import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handoffBody, handoffResponse } from '@/lib/agent-handoff-http';
import { startPairing } from '@/lib/agent-runners';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ name: z.string().trim().min(1).max(64) }).strict();

// POST /api/runner/pair - a runner asks to be connected. No sign-in: it answers with the runner's credential and a
// short code, and the credential fetches nothing until a person has typed the code into Collab.
export async function POST(request: NextRequest) {
  const response = await handoffResponse(async () => startPairing(bodySchema.parse(await handoffBody(request)).name));
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
