// This route is intentionally simplified and disabled.
// Workspace-level SSE provides the same events; use `/api/realtime/workspace/[workspaceId]/stream` instead.
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  _ctx: { params: Promise<{ viewId: string }> }
) {
  return NextResponse.json({
    error: 'View-level realtime stream is disabled. Subscribe to workspace stream instead.'
  }, { status: 410 });
}



