import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { saveSeatInstructions } from '@/lib/agent-seat-instructions';
import { SEAT_RANK_REFUSAL } from '@/lib/workspace-authority';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };
// The layer's own limit is checked on the trimmed text; this bound only keeps an oversized body from being handled.
const bodySchema = z.object({ text: z.string().max(64_000) }).strict();

// PUT /api/workspaces/[workspaceId]/agent-seats/[seatId]/instructions - save a seat's own instructions (CLB-610). Empty text
// removes them. Requires a signed-in person with MANAGE_AGENTS. The seat's own account cannot edit its instructions.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ workspaceId: string; seatId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
  const { workspaceId, seatId } = await params;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStore });

  const result = await saveSeatInstructions(session.user.id, workspaceId, seatId, body.data.text);
  if (!result.error) return NextResponse.json({ seat: result.seat, text: result.text }, { headers: noStore });
  if (result.error === 'too_long') return NextResponse.json({ error: result.message }, { status: 400, headers: noStore });
  const [status, error] = ({
    forbidden: [403, 'Forbidden'],
    outranked: [403, SEAT_RANK_REFUSAL],
    not_found: [404, 'Seat not found'],
  } as const)[result.error];
  return NextResponse.json({ error }, { status, headers: noStore });
}
