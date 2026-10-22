import { NextRequest, NextResponse } from 'next/server';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { previewIssueTrash } from '@/lib/issue-trash';
import { issueTrashErrorResponse } from '@/lib/issue-trash-response';

export const GET = withAppAuth(async (request: NextRequest, context: AppAuthContext,
  { params }: { params: Promise<{ issueIdOrKey: string }> }) => {
  try {
    return NextResponse.json(await previewIssueTrash(context.user.id, context.workspace.id,
      new URL(request.url).searchParams.get('projectId'), (await params).issueIdOrKey));
  } catch (error) { return issueTrashErrorResponse(error, 'app'); }
}, { requiredScopes: ['issues:read'] });
