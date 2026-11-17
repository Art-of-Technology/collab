import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { previewContextFolderTrash, readFolderBody, trashContextFolder, updateContextFolder } from '@/lib/context-folders';
import { contextFolderErrorResponse } from '@/lib/context-folders-response';

type Context = { params: Promise<{ id: string }> };

// GET /api/context/folders/[id] - the folder and what deleting it would take with it
export async function GET(_request: NextRequest, { params }: Context) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    return NextResponse.json(await previewContextFolderTrash(session.user.id, id));
  } catch (error) { return contextFolderErrorResponse(error); }
}

// PATCH /api/context/folders/[id] - rename a folder, or move it to another parent at the same level
export async function PATCH(request: NextRequest, { params }: Context) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const body = await readFolderBody(request);
    return NextResponse.json(await updateContextFolder(session.user.id, id, {
      ...('name' in body && { name: body.name }),
      ...('parentId' in body && { parentId: body.parentId ?? null }),
    }));
  } catch (error) { return contextFolderErrorResponse(error); }
}

// DELETE /api/context/folders/[id]?confirm=true - move the folder and everything in it to Trash.
// Without confirm, a folder that is not empty is refused with 409 and the counts, so the caller asks first.
export async function DELETE(request: NextRequest, { params }: Context) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const confirm = new URL(request.url).searchParams.get('confirm') === 'true';
    return NextResponse.json(await trashContextFolder(session.user.id, id, confirm));
  } catch (error) { return contextFolderErrorResponse(error); }
}
