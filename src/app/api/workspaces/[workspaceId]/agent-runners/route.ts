import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { HandoffError, admitRunner, listRunners } from '@/lib/agent-runners';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };
const bodySchema = z.object({ code: z.string().trim().min(8).max(32), ownerId: z.string().min(1).max(128).nullable().optional() }).strict();

// Runners are admitted and removed by a signed-in person only: no agent token reaches these routes.

// GET /api/workspaces/[workspaceId]/agent-runners - the viewer's runners; for the workspace's owner, everyone's.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
  const view = await listRunners((await params).workspaceId, session.user.id);
  return view ? NextResponse.json(view, { headers: noStore }) : NextResponse.json({ error: 'Workspace not found' }, { status: 404, headers: noStore });
}

// POST /api/workspaces/[workspaceId]/agent-runners - admit the runner that shows `code`, for the caller or, by the
// workspace's owner, for `ownerId`.
export async function POST(request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStore });
  try {
    return NextResponse.json(await admitRunner({ workspaceId: (await params).workspaceId, actorId: session.user.id, ...body.data }), { status: 201, headers: noStore });
  } catch (error) {
    if (error instanceof HandoffError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: noStore });
    throw error;
  }
}
