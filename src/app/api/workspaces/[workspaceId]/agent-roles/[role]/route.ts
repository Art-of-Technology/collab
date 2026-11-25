import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { saveRoleInstructions } from '@/lib/agent-role-instructions';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };
// The layer's own limit is checked on the trimmed text; this bound only keeps an oversized body from being handled.
const bodySchema = z.object({ text: z.string().max(64_000) }).strict();

// PUT /api/workspaces/[workspaceId]/agent-roles/[role] - save the organisation's own instructions for one role (CLB-608).
// Empty text removes them. Requires MANAGE_AGENTS.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ workspaceId: string; role: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
  const { workspaceId, role } = await params;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStore });

  const result = await saveRoleInstructions(session.user.id, workspaceId, role, body.data.text);
  if (!result.error) return NextResponse.json({ role: result.role, text: result.text }, { headers: noStore });
  if (result.error === 'too_long') return NextResponse.json({ error: result.message }, { status: 400, headers: noStore });
  const [status, error] = ({
    forbidden: [403, 'Forbidden'],
    not_found: [404, 'Workspace not found'],
    unknown_role: [404, 'There is no such role in the catalogue'],
  } as const)[result.error];
  return NextResponse.json({ error }, { status, headers: noStore });
}
