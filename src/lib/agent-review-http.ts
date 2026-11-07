import { NextResponse } from 'next/server';
import { z } from 'zod';
import { HandoffError } from './agent-handoffs';

// Database exceptions can contain bound request or response text. Do not log them.
export async function reviewResponse(run: () => Promise<unknown>) {
  try { return NextResponse.json(await run()); }
  catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'invalid_request', error_description: 'Invalid review request' }, { status: 400 });
    if (error instanceof HandoffError) return NextResponse.json({ error: error.code, error_description: error.message }, { status: error.status });
    if ((error as { code?: string })?.code === 'P2002') return NextResponse.json({ error: 'request_conflict', error_description: 'Review request conflicts with existing work. Read current reviews before retrying.' }, { status: 409 });
    console.error('Agent review request failed');
    return NextResponse.json({ error: 'review_unavailable', error_description: 'Agent reviews are temporarily unavailable' }, { status: 503 });
  }
}
