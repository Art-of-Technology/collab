import { notFound, redirect } from 'next/navigation';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import { workspaceAgentInbox, HandoffError } from '@/lib/agent-handoffs';
import { AgentInboxView } from '@/components/agents/AgentInboxView';
import { AgentsTabs } from '@/components/agents/AgentsTabs';
import { usesHandoffs } from '@/lib/agents-page';

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
  // The old handoff inbox: a tab of the Agents page while a project still uses handoffs, and readable at this address after that.
  return <>
    <AgentsTabs base={`/${encodeURIComponent(workspace.slug || workspace.id)}`} current="handoffs" handoffs={await usesHandoffs(workspace.id)} className="mx-auto w-full max-w-5xl px-6 pt-6" />
    <AgentInboxView workspace={workspace} agents={inbox.agents} selected={selected} state={state} inbox={inbox} />
  </>;
}
