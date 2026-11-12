import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { checkUserPermission, Permission } from '@/lib/permissions';
import { listAgentTokens } from '@/lib/agent-tokens';
import { Button } from '@/components/ui/button';
import AgentTokensManager from '@/components/workspace/AgentTokensManager';

export default async function AgentTokensPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const workspace = await prisma.workspace.findUnique({ where: { slug: workspaceId }, select: { id: true, name: true } })
    ?? await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, name: true } });
  if (!workspace) notFound();
  const { hasPermission } = await checkUserPermission(session.user.id, workspace.id, Permission.MANAGE_WORKSPACE_PERMISSIONS);
  if (!hasPermission) notFound();

  const tokens = await listAgentTokens(workspace.id);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <Link href={`/workspaces/${workspace.id}`}>
          <Button variant="ghost" size="sm" className="pl-0 text-muted-foreground">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to workspace
          </Button>
        </Link>
      </div>

      <div className="border-b border-border/40 pb-3 mb-4">
        <h1 className="text-2xl font-semibold text-foreground">Agent tokens</h1>
        <p className="text-sm text-muted-foreground">
          Named tokens that let an agent or another platform act in <strong>{workspace.name}</strong>. Everything done with a token is shown under its name.
        </p>
      </div>

      <AgentTokensManager
        workspaceId={workspace.id}
        tokens={tokens && tokens.map(token => ({
          id: token.id,
          name: token.name,
          access: token.access,
          // Plain date text, so the server and the browser render the same thing.
          createdAt: token.createdAt.toISOString().slice(0, 10),
          expiresAt: token.expiresAt ? token.expiresAt.toISOString().slice(0, 10) : null,
          expired: token.expired,
        }))}
      />
    </div>
  );
}
