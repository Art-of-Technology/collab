import { notFound, redirect } from 'next/navigation';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth';
import { checkUserPermission, Permission } from '@/lib/permissions';
import { readSeats, usesHandoffs } from '@/lib/agents-page';
import { readAgentFloor } from '@/lib/agent-floor';
import { AgentSeatsView } from '@/components/agents/AgentSeatsView';
import { AgentsTabs } from '@/components/agents/AgentsTabs';
import { OrganisationFloor } from '@/components/agents/floor/OrganisationFloor';

export const dynamic = 'force-dynamic';

// The Agents page: /agents is the Seats tab, /agents/inbox and /agents/floor the other two. The old handoff inbox stays at /agent-inbox.
export default async function AgentsPage({ params }: { params: Promise<{ workspaceId: string; tab?: string[] }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');
  const { workspaceId, tab: [tab = 'seats', ...rest] = [] } = await params;
  if (rest.length) notFound();
  if (tab === 'floor') {
    const snapshot = await readAgentFloor(session.user.id, workspaceId);
    if (!snapshot) notFound();
    const base = `/${encodeURIComponent(snapshot.workspace.slug || snapshot.workspace.id)}`;
    return <>
      <AgentsTabs base={base} current="floor" handoffs={await usesHandoffs(snapshot.workspace.id)} className="mx-auto w-full max-w-[1600px] px-4 pt-4 md:px-6 md:pt-6" />
      <OrganisationFloor initial={snapshot} />
    </>;
  }
  if (tab !== 'seats' && tab !== 'inbox') notFound();
  const view = await readSeats(session.user.id, workspaceId);
  if (!view) notFound();
  const [handoffs, manage] = await Promise.all([
    usesHandoffs(view.workspace.id),
    checkUserPermission(session.user.id, view.workspace.id, Permission.MANAGE_WORKSPACE_PERMISSIONS),
  ]);
  return <AgentSeatsView {...view} tab={tab} handoffs={handoffs} canManage={manage.hasPermission} />;
}
