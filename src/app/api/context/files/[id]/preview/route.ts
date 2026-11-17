import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { readContextFilePreview } from '@/lib/context-files';
import { previewHeaders } from '@/lib/context-file-preview';
import { contextFileErrorResponse } from '@/lib/context-files-response';

// GET /api/context/files/[id]/preview - what it takes to show the file, for whoever may read its folder.
// An image and a PDF are the bytes, served the one way a browser draws them; a text file and a CSV are
// their first bytes as JSON, drawn as text and never as a page. Any other type is named, not shown.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const result = await readContextFilePreview(session.user.id, id);
    if ('body' in result) {
      return new NextResponse(result.body, { headers: previewHeaders(result.file, result.kind) });
    }
    return NextResponse.json(result.preview, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return contextFileErrorResponse(error); }
}
