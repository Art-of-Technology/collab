import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { readRoleInstructions } from '@/lib/agent-role-instructions';
import { Button } from '@/components/ui/button';
import { RoleInstructionsSettings } from '@/components/workspace/RoleInstructionsSettings';

export const dynamic = 'force-dynamic';

// Workspace settings, Roles (CLB-608): every member reads each role's layers; those who may manage permissions edit the organisation's,
// and add the organisation's own roles (CLB-626).
export default async function RolesPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const view = await readRoleInstructions(session.user.id, workspaceId);
  if (!view) notFound();

  return (
    <div className="p-4 pb-28 md:p-6 md:pb-28 max-w-6xl mx-auto">
      <div className="mb-4">
        <Link href={`/workspaces/${view.workspace.id}`}>
          <Button variant="ghost" size="sm" className="pl-0 text-muted-foreground">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to workspace settings
          </Button>
        </Link>
      </div>

      <div className="border-b border-border/40 pb-3 mb-4">
        <h1 className="text-2xl font-semibold text-foreground">Roles</h1>
        <p className="text-sm text-muted-foreground">
          What a seat of each role is told when its run starts. Collab&apos;s rules come first and cannot be removed. Your organisation adds to them. A seat adds its own on top.
        </p>
      </div>

      <RoleInstructionsSettings workspaceId={view.workspace.id} canEdit={view.canEdit} roles={view.roles} custom={view.custom} />
    </div>
  );
}
