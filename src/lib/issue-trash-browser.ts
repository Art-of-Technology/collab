import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { changeIssueTrash } from '@/lib/issue-trash';
import { issueTrashErrorResponse } from '@/lib/issue-trash-response';

export async function issueTrashBrowserMutation(request: NextRequest, id: string, action: 'RESTORED' | 'PURGED') {
  // App/agent tokens must never gain purge rights through the browser endpoint.
  if (action === 'PURGED' && request.headers.has('authorization')) {
    return NextResponse.json({ error: 'Permanent deletion requires an administrator browser session' }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.workspaceId !== 'string' || typeof body.projectId !== 'string' ||
    (action === 'PURGED' && typeof body.confirmIssueKey !== 'string')) {
    return NextResponse.json({ error: 'Workspace, project and deletion confirmation where applicable are required' }, { status: 400 });
  }
  try {
    return NextResponse.json(await changeIssueTrash({ idOrKey: id, workspaceId: body.workspaceId,
      projectId: body.projectId, action, confirmIssueKey: body.confirmIssueKey, actor: { userId: user.id, client: 'browser' } }));
  } catch (error) { return issueTrashErrorResponse(error); }
}
