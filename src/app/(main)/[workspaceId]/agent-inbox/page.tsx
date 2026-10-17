import { notFound, redirect } from 'next/navigation';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import { agentInbox } from '@/lib/agent-handoffs';
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
  const agents = await prisma.agentRegistration.findMany({
    where: { workspaceId: workspace.id, userId: session.user.id },
    select: { name: true }, orderBy: { name: 'asc' }, take: 200,
  });
  const query = await searchParams;
  const selected = query.agent ?? agents[0]?.name;
  if (selected && !agents.some(agent => agent.name === selected)) notFound();
  const state = query.state === 'claimed' ? 'claimed' : 'unseen';
  const inbox = selected ? await agentInbox({ user: { id: session.user.id }, workspace }, {
    agent: selected, state, limit: 50,
  }) : null;
  return <AgentInboxView workspace={workspace} agents={agents} selected={selected} state={state} inbox={inbox} />;
}
