import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { listIssueTrash } from '@/lib/issue-trash';
import { issueTrashErrorResponse } from '@/lib/issue-trash-response';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const query = new URL(request.url).searchParams;
    return NextResponse.json(await listIssueTrash(user.id, query.get('workspaceId'), query.get('projectId')));
  } catch (error) { return issueTrashErrorResponse(error); }
}
