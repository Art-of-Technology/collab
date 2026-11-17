import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { listContextFiles, uploadContextFile, MAX_CONTEXT_FILE_BYTES } from '@/lib/context-files';
import { contextFileErrorResponse } from '@/lib/context-files-response';
import { withRateLimit, mediaUploadRateLimit } from '@/lib/rate-limit';

// What a multipart envelope adds around the bytes. The stated limit is checked on the bytes themselves;
// this only turns away a body that is far too large before it is read.
const ENVELOPE_ALLOWANCE = 64 * 1024;

// GET /api/context/files?folder=&trashed= - the files of one folder, or the ones in Trash
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const query = new URL(request.url).searchParams;
    return NextResponse.json(await listContextFiles(session.user.id, {
      folderId: query.get('folder'),
      trashed: query.get('trashed') === 'true',
    }));
  } catch (error) { return contextFileErrorResponse(error); }
}

// POST /api/context/files - multipart: the file itself, the folder it goes in, and an optional name
export const POST = withRateLimit(async function (request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const declared = Number(request.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_CONTEXT_FILE_BYTES + ENVELOPE_ALLOWANCE) {
      return NextResponse.json(
        { error: `A file is at most ${Math.round(MAX_CONTEXT_FILE_BYTES / (1024 * 1024))} MB` },
        { status: 413 },
      );
    }
    // A body that is not the form this route asks for is the caller's error, not the server's.
    const form = await request.formData().catch(() => null);
    const upload = form?.get('file');
    if (!upload || typeof upload === 'string' || typeof upload.arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'A file is required' }, { status: 400 });
    }
    const given = form?.get('name');
    const file = await uploadContextFile(session.user.id, {
      folderId: form?.get('folderId'),
      name: typeof given === 'string' && given.trim() ? given : upload.name,
      bytes: new Uint8Array(await upload.arrayBuffer()),
    });
    return NextResponse.json(file, { status: 201 });
  } catch (error) { return contextFileErrorResponse(error); }
}, mediaUploadRateLimit);
