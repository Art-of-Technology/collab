import { NextRequest, NextResponse } from 'next/server';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { listIssueTrash } from '@/lib/issue-trash';
import { issueTrashErrorResponse } from '@/lib/issue-trash-response';

export const GET = withAppAuth(async (request: NextRequest, context: AppAuthContext) => {
  try {
    const result = await listIssueTrash(context.user.id, context.workspace.id, new URL(request.url).searchParams.get('projectId'));
    return NextResponse.json({ issues: result.issues, canPurge: false });
  } catch (error) { return issueTrashErrorResponse(error, 'app'); }
}, { requiredScopes: ['issues:read'] });
