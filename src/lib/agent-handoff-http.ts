import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { HandoffError } from './agent-handoffs';

export async function handoffBody(request: NextRequest) {
  const reader = request.body?.getReader();
  if (!reader) throw new HandoffError('invalid_json', 'Expected a JSON request body');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) { await reader.cancel(); throw new HandoffError('body_too_large', 'Request body must be at most 64 KiB', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw); }
  catch { throw new HandoffError('invalid_json', 'Expected a JSON request body'); }
}
export async function handoffResponse(run: () => Promise<unknown>) {
  try { return NextResponse.json(await run()); }
  catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'invalid_request', error_description: error.issues.map(i => i.message).join('; ') }, { status: 400 });
    if (error instanceof HandoffError) return NextResponse.json({ error: error.code, error_description: error.message }, { status: error.status });
    if ((error as { code?: string }).code === 'P2002') return NextResponse.json({ error: 'request_conflict', error_description: 'A concurrent request already created this record; retry using the same requestId' }, { status: 409 });
    console.error('Agent handoff failed', error);
    return NextResponse.json({ error: 'handoff_unavailable', error_description: 'Agent handoffs are temporarily unavailable' }, { status: 503 });
  }
}
