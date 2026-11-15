import { NextRequest, NextResponse } from 'next/server';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { HandoffError, seatWriteGuard } from '@/lib/agent-seats';
import { prisma } from '@/lib/prisma';
import { changeIssueTrash, IssueTrashError } from '@/lib/issue-trash';
import { issueTrashErrorResponse } from '@/lib/issue-trash-response';

export const POST = withAppAuth(async (request: NextRequest, context: AppAuthContext,
  { params }: { params: Promise<{ issueIdOrKey: string }> }) => {
  try {
    const projectId = new URL(request.url).searchParams.get('projectId');
    if (!projectId) throw new IssueTrashError(400, 'Project is required');
    await seatWriteGuard(prisma, context, projectId);
    return NextResponse.json(await changeIssueTrash({ idOrKey: (await params).issueIdOrKey,
      workspaceId: context.workspace.id, projectId, action: 'RESTORED',
      actor: { userId: context.user.id, client: 'app', appId: context.app.id, installationId: context.installation.id } }));
  } catch (error) {
    if (error instanceof HandoffError) return NextResponse.json({ error: error.code, error_description: error.message }, { status: error.status });
    return issueTrashErrorResponse(error, 'app');
  }
}, { requiredScopes: ['issues:write'], seatWrites: true });
