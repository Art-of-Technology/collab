/**
 * Third-Party App API: Context folders
 * GET /api/apps/auth/context/folders?projectId= - the folders of the workspace, and of one project
 *
 * Required scope: context:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { userHasWorkspaceAccess } from '@/lib/issue-finder';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { agentContextFailure, folderOffset, listAgentFolders } from '@/lib/agent-context-folders';

export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    if (!await userHasWorkspaceAccess(context.user.id, context.workspace.id)) {
      return NextResponse.json(
        { error: 'workspace_access_denied', error_description: 'Active workspace access required' },
        { status: 403 },
      );
    }
    try {
      const projectId = new URL(request.url).searchParams.get('projectId');
      return NextResponse.json(await listAgentFolders(context.user.id, context.workspace.id, projectId || null, folderOffset(new URL(request.url).searchParams.get('offset'))));
    } catch (error) {
      const failure = agentContextFailure(error);
      return NextResponse.json(failure.body, { status: failure.status });
    }
  },
  { requiredScopes: ['context:read'] },
);
