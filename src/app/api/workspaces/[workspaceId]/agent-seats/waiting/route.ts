import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { readSeats } from '@/lib/agents-page';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

// GET /api/workspaces/[workspaceId]/agent-seats/waiting - how many issues wait for the seats the caller may see: the number in the left menu.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
  const view = await readSeats(session.user.id, (await params).workspaceId);
  if (!view) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: noStore });
  return NextResponse.json({ waiting: view.seats.reduce((sum, seat) => sum + seat.waiting.length, 0) }, { headers: noStore });
}
