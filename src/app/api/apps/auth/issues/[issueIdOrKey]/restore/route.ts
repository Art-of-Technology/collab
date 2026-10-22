import { NextRequest, NextResponse } from 'next/server';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { changeIssueTrash, IssueTrashError } from '@/lib/issue-trash';
import { issueTrashErrorResponse } from '@/lib/issue-trash-response';

export const POST = withAppAuth(async (request: NextRequest, context: AppAuthContext,
  { params }: { params: Promise<{ issueIdOrKey: string }> }) => {
  try {
    const projectId = new URL(request.url).searchParams.get('projectId');
    if (!projectId) throw new IssueTrashError(400, 'Project is required');
    return NextResponse.json(await changeIssueTrash({ idOrKey: (await params).issueIdOrKey,
      workspaceId: context.workspace.id, projectId, action: 'RESTORED',
      actor: { userId: context.user.id, client: 'app', appId: context.app.id, installationId: context.installation.id } }));
  } catch (error) { return issueTrashErrorResponse(error); }
}, { requiredScopes: ['issues:write'] });
