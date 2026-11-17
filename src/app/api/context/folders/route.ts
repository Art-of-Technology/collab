import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { createContextFolder, listContextFolders, readFolderBody } from '@/lib/context-folders';
import { contextFolderErrorResponse } from '@/lib/context-folders-response';

// GET /api/context/folders?workspace=&project=&trashed= - folders of one level, or its Trash
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const query = new URL(request.url).searchParams;
    return NextResponse.json(await listContextFolders(session.user.id, {
      workspaceId: query.get('workspace'),
      projectId: query.get('project'),
      trashed: query.get('trashed') === 'true',
    }));
  } catch (error) { return contextFolderErrorResponse(error); }
}

// POST /api/context/folders - a folder at workspace level, in a project, or inside another folder
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await readFolderBody(request);
    const folder = await createContextFolder(session.user.id, {
      workspaceId: body.workspaceId,
      projectId: body.projectId,
      parentId: body.parentId,
      name: body.name,
    });
    return NextResponse.json(folder, { status: 201 });
  } catch (error) { return contextFolderErrorResponse(error); }
}
