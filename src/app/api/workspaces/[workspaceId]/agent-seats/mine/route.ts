import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { HandoffError, addMySeats, removeMySeats } from '@/lib/agent-seat-setup';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStore });
// No owner on purpose: the seats are the signed-in person's own, and a request that names anything else is refused.
const schema = z.object({ projectId: z.string().min(1).max(128) }).strict();
type Params = { params: Promise<{ workspaceId: string }> };

async function own(context: Params, input: unknown, act: typeof addMySeats | typeof removeMySeats, status = 200) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return reply({ error: 'Unauthorized' }, 401);
  const body = schema.safeParse(input);
  if (!body.success) return reply({ error: 'Invalid request' }, 400);
  try {
    return reply(await act({ workspaceId: (await context.params).workspaceId, userId: session.user.id, projectId: body.data.projectId }), status);
  } catch (error) {
    if (error instanceof HandoffError) return reply({ error: error.message, code: error.code }, error.status);
    throw error;
  }
}

// POST /api/workspaces/[workspaceId]/agent-seats/mine - the signed-in person adds their own developer, reviewer and
// security seat to a project whose owner switched that on. Answers with the names of the seats it made.
export async function POST(request: NextRequest, context: Params) {
  return own(context, await request.json().catch(() => null), addMySeats, 201);
}

// DELETE /api/workspaces/[workspaceId]/agent-seats/mine?projectId= - the signed-in person retires their own seats of
// those three roles in the project. Answers with the seats removed and the seats kept, each with the reason.
export async function DELETE(request: NextRequest, context: Params) {
  return own(context, { projectId: new URL(request.url).searchParams.get('projectId') }, removeMySeats);
}
