import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { checkUserPermission, Permission } from '@/lib/permissions';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import { membershipRows } from '@/lib/workspace-membership';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import UserWorkspaceSwitches from '@/components/workspace/UserWorkspaceSwitches';

export default async function MemberWorkspacesPage({ params }: { params: Promise<{ workspaceId: string; userId: string }> }) {
  const { workspaceId, userId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');
  const viewerId = session.user.id;
  const manages = async (id: string) => (await checkUserPermission(viewerId, id, Permission.MANAGE_WORKSPACE_MEMBERS)).hasPermission;

  const select = { id: true, name: true, ownerId: true };
  const workspace = await prisma.workspace.findUnique({ where: { slug: workspaceId }, select })
    ?? await prisma.workspace.findUnique({ where: { id: workspaceId }, select });
  if (!workspace || !await manages(workspace.id)) notFound();

  // Only a person of this workspace: an account with no email is an agent, managed on the Agent tokens page.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } });
  if (!user?.email) notFound();
  if (workspace.ownerId !== user.id && !await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } }, select: { status: true },
  })) notFound();

  // The viewer's other workspaces, kept only where the viewer may manage members too.
  const others = await prisma.workspace.findMany({
    where: { ...postWorkspaceAccessWhere(viewerId), id: { not: workspace.id } },
    select: { id: true, name: true, slug: true, ownerId: true },
    orderBy: { name: 'asc' },
  });
  const manageable = [];
  for (const row of others) if (await manages(row.id)) manageable.push(row);
  const rows = await membershipRows(user.id, manageable);

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
        <h1 className="text-2xl font-semibold text-foreground">Workspaces for {user.name || user.email}</h1>
        <p className="text-sm text-muted-foreground">
          {user.email} is in <strong>{workspace.name}</strong>. Add them to your other workspaces without an invitation, or switch them off there.
        </p>
      </div>

      <Card className="border border-border/40 bg-card/50">
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-base font-medium">Your other workspaces</CardTitle>
          <CardDescription className="text-xs">
            Only workspaces where you may manage members are listed. Switching one off keeps the person&apos;s role for later.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <UserWorkspaceSwitches userId={user.id} userName={user.name || user.email} workspaces={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
