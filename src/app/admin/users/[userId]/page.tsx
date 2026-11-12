import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { systemAdminId } from '@/lib/system-admin';
import { membershipRows } from '@/lib/workspace-membership';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import UserWorkspaceSwitches from '@/components/workspace/UserWorkspaceSwitches';

export default async function AdminUserPage({ params }: { params: Promise<{ userId: string }> }) {
  if (!await systemAdminId()) notFound();
  const { userId } = await params;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } });
  if (!user) notFound();
  // An account with no email is an agent token's service account.
  const rows = user.email ? await membershipRows(user.id, await prisma.workspace.findMany({
    select: { id: true, name: true, slug: true, ownerId: true }, orderBy: { name: 'asc' },
  })) : null;

  return (
    <div className="space-y-6">
      <Link href="/admin/users">
        <Button variant="ghost" size="sm" className="pl-0 text-gray-400">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Users
        </Button>
      </Link>
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">{user.name || 'Unknown'}</h2>
        <p className="text-gray-400">{user.email ?? 'Agent service account'}</p>
      </div>
      <Card className="bg-collab-950 border-collab-700">
        <CardHeader>
          <CardTitle className="text-white">Workspaces</CardTitle>
          <CardDescription className="text-gray-500">
            {rows
              ? 'Switch a workspace on to make this person a member there without an invitation, or off to stop their access. Their role is kept.'
              : 'An agent is let into workspaces on the Agent tokens page of the workspace its tokens belong to.'}
          </CardDescription>
        </CardHeader>
        {rows && (
          <CardContent>
            <UserWorkspaceSwitches userId={user.id} userName={user.name || user.email || 'This person'} workspaces={rows} />
          </CardContent>
        )}
      </Card>
    </div>
  );
}
