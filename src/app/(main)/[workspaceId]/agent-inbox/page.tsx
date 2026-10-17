import { notFound, redirect } from 'next/navigation';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import { workspaceAgentInbox, HandoffError } from '@/lib/agent-handoffs';
import { AgentInboxView } from '@/components/agents/AgentInboxView';

export const dynamic = 'force-dynamic';

export default async function AgentInboxPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ agent?: string; state?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');
  const { workspaceId } = await params;
  const workspace = await prisma.workspace.findFirst({
    where: postWorkspaceAccessWhere(session.user.id, workspaceId), select: { id: true, slug: true },
  });
  if (!workspace) notFound();
  const query = await searchParams;
  const selected = query.agent || undefined;
  const state = query.state === 'claimed' ? 'claimed' : 'unseen';
  let inbox;
  try {
    inbox = await workspaceAgentInbox({ user: { id: session.user.id }, workspace }, {
      agent: selected, state, limit: 50,
    });
  } catch (error) {
    if (error instanceof HandoffError && error.code === 'agent_not_found') notFound();
    throw error;
  }
  return <AgentInboxView workspace={workspace} agents={inbox.agents} selected={selected} state={state} inbox={inbox} />;
}
