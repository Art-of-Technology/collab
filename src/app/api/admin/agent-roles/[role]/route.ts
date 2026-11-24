import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { systemAdminId } from '@/lib/system-admin';
import { savePlatformPrompt } from '@/lib/agent-platform-prompts';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };
// The layer's own limit and the reason's are checked on the trimmed text; these bounds only keep an oversized body from being handled.
const reason = z.string().max(4_000);
const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), text: z.string().max(64_000), reason }).strict(),
  z.object({ action: z.literal('restore'), versionId: z.string().min(1).max(64), reason }).strict(),
  z.object({ action: z.literal('repository'), reason }).strict(),
]);

// POST /api/admin/agent-roles/[role] - add a version of a role's platform prompt (CLB-916): a new text, an earlier version
// again, or the repository's text again. Only a system admin, signed in; an agent token is no session and is refused.
export async function POST(request: NextRequest, { params }: { params: Promise<{ role: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
  // The role is read from the database, so a session issued before someone stopped being a system admin does not count.
  const adminId = await systemAdminId();
  if (!adminId) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: noStore });
  const { role } = await params;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStore });

  const result = await savePlatformPrompt(adminId, role, body.data);
  if (!result.error) return NextResponse.json({ role: result.role }, { headers: noStore });
  if (result.error === 'invalid') return NextResponse.json({ error: result.message }, { status: 400, headers: noStore });
  const [status, error] = ({
    unknown_role: [404, 'There is no such role in the catalogue'],
    unknown_version: [404, 'There is no such version of this role'],
    unchanged: [409, 'That is already the text in force'],
    conflict: [409, 'Someone else saved this role at the same time. Reload the page and try again'],
  } as const)[result.error];
  return NextResponse.json({ error }, { status, headers: noStore });
}
