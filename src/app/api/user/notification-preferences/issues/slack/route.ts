import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { issueAccessWhere } from '@/lib/issue-finder';
import { removeSlackAddress, saveSlackAddress, sendSlackTest } from '@/lib/notification-settings';

const NOT_SLACK = 'Only a Slack webhook address is accepted. It starts with https://hooks.slack.com/services/';

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

// No error here is logged or echoed: it could carry the address.
const failed = () => NextResponse.json({ error: 'Internal server error' }, { status: 500 });

export async function PUT(req: NextRequest) {
  try {
    const caller = await who();
    if ('refuse' in caller) return caller.refuse;
    const body: unknown = await req.json().catch(() => null);
    const url = body && typeof body === 'object' ? (body as { url?: unknown }).url : undefined;
    const settings = await saveSlackAddress(caller.userId, caller.workspaceId, url);
    if ('error' in settings) {
      if (settings.error === 'not_slack') return NextResponse.json({ error: 'not_slack', message: NOT_SLACK }, { status: 400 });
      return NextResponse.json({ error: 'not_configured' }, { status: 503 });
    }
    return NextResponse.json(settings);
  } catch {
    return failed();
  }
}

export async function DELETE() {
  try {
    const caller = await who();
    if ('refuse' in caller) return caller.refuse;
    return NextResponse.json(await removeSlackAddress(caller.userId, caller.workspaceId));
  } catch {
    return failed();
  }
}

export async function POST() {
  try {
    const caller = await who();
    if ('refuse' in caller) return caller.refuse;
    return NextResponse.json(await sendSlackTest(caller.userId, caller.workspaceId));
  } catch {
    return failed();
  }
}
