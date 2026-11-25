import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth';
import { readSeatPage } from '@/lib/agent-seat-instructions';
import { SeatInstructions } from '@/components/agents/SeatInstructions';

export const dynamic = 'force-dynamic';

// A seat's own page (CLB-610): what the seat is, and the instructions for this seat, the third layer of its runs.
export default async function SeatPage({ params }: { params: Promise<{ workspaceId: string; seatId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');
  const { workspaceId, seatId } = await params;
  const view = await readSeatPage(session.user.id, workspaceId, seatId);
  if (!view) notFound();
  const { workspace, seat, canEdit } = view;
  // The workspace's own role by its name (CLB-628), else the built-in one.
  const role = seat.customRole ?? `${seat.role[0].toUpperCase()}${seat.role.slice(1)}`;
  return <main className="w-full max-w-3xl space-y-6 p-6">
    <Link className="text-sm text-primary underline-offset-4 hover:underline" href={`/${encodeURIComponent(workspace.slug || workspace.id)}/agents`}>Seats</Link>
    <div className="space-y-1">
      <h1 className="text-xl font-semibold">{seat.name}</h1>
      <p className="text-sm text-muted-foreground">{role} seat of {seat.project} · {seat.owner ? `owner ${seat.owner}` : 'no owner (API key)'}</p>
    </div>
    <SeatInstructions workspaceId={workspace.id} canEdit={canEdit} seat={seat} />
    <p className="text-sm text-muted-foreground">A run reads the platform layer first, then what your organisation adds for the role, then this seat&apos;s. The first two are on the{' '}
      <Link className="text-primary underline-offset-4 hover:underline" href={`/workspaces/${encodeURIComponent(workspace.id)}/settings/roles`}>Roles</Link> page.</p>
  </main>;
}
