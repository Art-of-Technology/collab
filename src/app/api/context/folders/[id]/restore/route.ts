import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { restoreContextFolder } from '@/lib/context-folders';
import { contextFolderErrorResponse } from '@/lib/context-folders-response';

// POST /api/context/folders/[id]/restore - take the folder and what went in with it back out of Trash
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    return NextResponse.json(await restoreContextFolder(session.user.id, id));
  } catch (error) { return contextFolderErrorResponse(error); }
}
