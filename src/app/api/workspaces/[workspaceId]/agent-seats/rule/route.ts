import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { HandoffError, seatRuleState, setSeatRule } from '@/lib/agent-seat-setup';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };
const bodySchema = z.object({ on: z.boolean() }).strict();

// The rule that gives every new project its seats (CLB-519) is read and switched by a signed-in person only: no token
// reaches these routes, so no agent or seat can switch it or change its daily limit.

// GET /api/workspaces/[workspaceId]/agent-seats/rule - whether the rule is on, and how many projects it gave seats today.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
  const state = await seatRuleState((await params).workspaceId, session.user.id);
  return state ? NextResponse.json(state, { headers: noStore }) : NextResponse.json({ error: 'Workspace not found' }, { status: 404, headers: noStore });
}

// PUT /api/workspaces/[workspaceId]/agent-seats/rule - the workspace's owner switches the rule on or off.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
  // Only Collab's own page switches it: a page elsewhere can post a form with the person's session, but not JSON with this origin.
  if (request.headers.get('origin') !== new URL(process.env.NEXTAUTH_URL || request.url).origin || !request.headers.get('content-type')?.startsWith('application/json')) {
    return NextResponse.json({ error: 'The rule is switched from Collab itself', code: 'same_origin' }, { status: 403, headers: noStore });
  }
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStore });
  try {
    return NextResponse.json(await setSeatRule({ workspaceId: (await params).workspaceId, actorId: session.user.id, on: body.data.on }), { headers: noStore });
  } catch (error) {
    if (error instanceof HandoffError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: noStore });
    throw error;
  }
}
