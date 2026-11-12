import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { checkUserPermission, Permission } from '@/lib/permissions';
import { getWorkspaceTemplates } from '@/lib/issue-template-store';
import { TEMPLATED_TYPES } from '@/lib/issue-templates';
import { Button } from '@/components/ui/button';
import IssueTemplatesSettings from '@/components/workspace/IssueTemplatesSettings';

export default async function IssueTemplatesPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const { hasPermission } = await checkUserPermission(session.user.id, workspaceId, Permission.MANAGE_WORKSPACE_SETTINGS);
  if (!hasPermission) notFound();

  const { templates } = await getWorkspaceTemplates(workspaceId);

  return (
    <div className="p-4 pb-28 md:p-6 md:pb-28 max-w-4xl mx-auto">
      <div className="mb-4">
        <Link href={`/workspaces/${workspaceId}`}>
          <Button variant="ghost" size="sm" className="pl-0 text-muted-foreground">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to workspace settings
          </Button>
        </Link>
      </div>

      <div className="border-b border-border/40 pb-3 mb-4">
        <h1 className="text-2xl font-semibold text-foreground">Issue templates</h1>
        <p className="text-sm text-muted-foreground">
          The sections and fields every issue of a type should have, the same in every project of this workspace.
          Subtasks have no template.
        </p>
      </div>

      <IssueTemplatesSettings workspaceId={workspaceId} initialTemplates={TEMPLATED_TYPES.map(type => templates[type])} />
    </div>
  );
}
