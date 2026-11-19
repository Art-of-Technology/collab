import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { listContextItems } from '@/lib/context-items';
import { contextFolderErrorResponse } from '@/lib/context-folders-response';

// GET /api/context/items?folder= - the Notes and files of one folder. Without a folder it answers for
// the top of a level, ?workspace=&project=, where there are Notes but no files. ?workspace=&view= answers
// for one of the workspace's lists: pinned, personal or shared.
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const query = new URL(request.url).searchParams;
    const offset = Number(query.get('offset') ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0) return NextResponse.json({ error: 'Invalid offset' }, { status: 400 });
    return NextResponse.json(await listContextItems(session.user.id, {
      workspaceId: query.get('workspace'),
      projectId: query.get('project'),
      folderId: query.get('folder'),
      view: query.get('view'),
      offset,
    }));
  } catch (error) { return contextFolderErrorResponse(error); }
}
