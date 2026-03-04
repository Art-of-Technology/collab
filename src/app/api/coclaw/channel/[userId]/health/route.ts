/**
 * Coclaw Channel Health Check
 *
 * Simple health endpoint for the Coclaw Collab channel to verify
 * connectivity to the Collab API.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;

  return NextResponse.json({
    status: 'ok',
    channel: 'collab',
    userId,
    timestamp: new Date().toISOString(),
  });
}
