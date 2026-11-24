import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { createCustomRole, customRoleRefusal } from '@/lib/agent-custom-roles';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };
// The name's and the layer's own limits are checked on the trimmed text; these bounds only keep an oversized body from being handled.
const bodySchema = z.object({ name: z.string().max(1_000), baseRole: z.string().max(100), instructions: z.string().max(64_000) }).strict();

// POST /api/workspaces/[workspaceId]/agent-custom-roles - add a role of the workspace's own that behaves like a built-in
// one (CLB-626). Only someone who may manage the workspace's permissions may.
export async function POST(request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
  const { workspaceId } = await params;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStore });

  const result = await createCustomRole(session.user.id, workspaceId, body.data);
  if ('role' in result) return NextResponse.json({ role: result.role }, { status: 201, headers: noStore });
  const { status, body: refused } = customRoleRefusal(result);
  return NextResponse.json(refused, { status, headers: noStore });
}
