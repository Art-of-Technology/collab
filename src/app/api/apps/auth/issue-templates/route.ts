/**
 * Third-Party App API: Issue Templates
 * GET /api/apps/auth/issue-templates - The workspace's template for each issue type
 *
 * Required scopes: issues:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { userHasWorkspaceAccess } from '@/lib/issue-finder';
import { getWorkspaceTemplates } from '@/lib/issue-template-store';
import { TEMPLATED_TYPES, withBody } from '@/lib/issue-templates';

export const GET = withAppAuth(
  async (_request: NextRequest, context: AppAuthContext) => {
    try {
      if (!await userHasWorkspaceAccess(context.user.id, context.workspace.id)) {
        return NextResponse.json(
          { error: 'workspace_access_denied', error_description: 'Active workspace access required' },
          { status: 403 }
        );
      }
      const { enforced, templates } = await getWorkspaceTemplates(context.workspace.id);
      return NextResponse.json({ enforced, templates: TEMPLATED_TYPES.map(type => withBody(templates[type])) });
    } catch (error) {
      console.error('Error listing issue templates:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['issues:read'] }
);
