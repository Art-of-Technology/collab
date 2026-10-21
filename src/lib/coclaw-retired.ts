import { NextResponse } from 'next/server';

/** Retired capabilities never load credentials, start a worker or read stored chats. */
export function coclawRetired() {
  return NextResponse.json(
    { error: 'coclaw_retired', message: 'Coclaw has been retired. External agents can use Collab CLI and agent inbox.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}
