import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { issueAccessWhere } from '@/lib/issue-finder';
import { parseChoices, readSettings, setSlackOn, updateChoices } from '@/lib/notification-settings';

/** The signed-in person and the workspace they are in, or the answer that refuses them. */
async function who(): Promise<{ userId: string; workspaceId: string } | { refuse: Response }> {
  const user = await getCurrentUser();
  if (!user?.id) return { refuse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const workspaceId = (await cookies()).get('currentWorkspaceId')?.value;
  if (!workspaceId) return { refuse: NextResponse.json({ error: 'Workspace not set' }, { status: 400 }) };
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, ...issueAccessWhere(user.id).workspace },
    select: { id: true },
  });
  if (!workspace) return { refuse: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { userId: user.id, workspaceId };
}

export async function GET() {
  try {
    const caller = await who();
    if ('refuse' in caller) return caller.refuse;
    return NextResponse.json(await readSettings(caller.userId, caller.workspaceId));
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const caller = await who();
    if ('refuse' in caller) return caller.refuse;
    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 });
    }
    const { slackOn, ...choices } = body as Record<string, unknown>;
    if (slackOn !== undefined && typeof slackOn !== 'boolean') {
      return NextResponse.json({ error: 'invalid' }, { status: 400 });
    }
    // Check everything before writing anything.
    if (!parseChoices(choices)) return NextResponse.json({ error: 'invalid' }, { status: 400 });
    let settings = await updateChoices(caller.userId, caller.workspaceId, choices);
    if ('error' in settings) return NextResponse.json({ error: 'invalid' }, { status: 400 });
    if (typeof slackOn === 'boolean') {
      const switched = await setSlackOn(caller.userId, caller.workspaceId, slackOn);
      if ('error' in switched) return NextResponse.json({ error: 'no_address' }, { status: 409 });
      settings = switched;
    }
    return NextResponse.json(settings);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
