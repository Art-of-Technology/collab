import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { readFolderBody } from '@/lib/context-folders';
import { trashContextFile, updateContextFile } from '@/lib/context-files';
import { contextFileErrorResponse } from '@/lib/context-files-response';

type Context = { params: Promise<{ id: string }> };

// PATCH /api/context/files/[id] - rename a file, or move it to another folder of its workspace
export async function PATCH(request: NextRequest, { params }: Context) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const body = await readFolderBody(request);
    return NextResponse.json(await updateContextFile(session.user.id, id, {
      ...('name' in body && { name: body.name }),
      ...('folderId' in body && { folderId: body.folderId }),
    }));
  } catch (error) { return contextFileErrorResponse(error); }
}

// DELETE /api/context/files/[id] - move the file to Trash, where restoring takes it back
export async function DELETE(_request: NextRequest, { params }: Context) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    return NextResponse.json(await trashContextFile(session.user.id, id));
  } catch (error) { return contextFileErrorResponse(error); }
}
