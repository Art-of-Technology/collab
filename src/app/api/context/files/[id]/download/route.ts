import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { downloadHeaders, readContextFileBytes } from '@/lib/context-files';
import { contextFileErrorResponse } from '@/lib/context-files-response';

// GET /api/context/files/[id]/download - the bytes, for whoever may read the folder the file is in.
// They arrive as an attachment of one opaque type, so a file can never run as a page of Collab's site.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const { file, body } = await readContextFileBytes(session.user.id, id);
    return new NextResponse(body, { headers: downloadHeaders(file) });
  } catch (error) { return contextFileErrorResponse(error); }
}
