import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { restoreContextFile } from '@/lib/context-files';
import { contextFileErrorResponse } from '@/lib/context-files-response';

// POST /api/context/files/[id]/restore - take the file back out of Trash, into the folder it left
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    return NextResponse.json(await restoreContextFile(session.user.id, id));
  } catch (error) { return contextFileErrorResponse(error); }
}
