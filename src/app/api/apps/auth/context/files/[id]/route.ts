/**
 * Third-Party App API: One Context file
 * GET /api/apps/auth/context/files/[id] - what the file is, and its text when it is one that is read
 *
 * Required scope: context:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { userHasWorkspaceAccess } from '@/lib/issue-finder';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { agentContextFailure, readAgentFile } from '@/lib/agent-context-folders';

export const GET = withAppAuth(
  async (_request: NextRequest, context: AppAuthContext, routeParams: { params: Promise<{ id: string }> }) => {
    if (!await userHasWorkspaceAccess(context.user.id, context.workspace.id)) {
      return NextResponse.json(
        { error: 'workspace_access_denied', error_description: 'Active workspace access required' },
        { status: 403 },
      );
    }
    try {
      const { id } = await routeParams.params;
      // The text of a file is never cached by anything between here and the caller.
      return NextResponse.json(await readAgentFile(context.user.id, context.workspace.id, id), {
        headers: { 'Cache-Control': 'private, no-store' },
      });
    } catch (error) {
      const failure = agentContextFailure(error);
      return NextResponse.json(failure.body, { status: failure.status });
    }
  },
  { requiredScopes: ['context:read'] },
);
