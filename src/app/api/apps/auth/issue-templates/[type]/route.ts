/**
 * Third-Party App API: One Issue Template
 * GET /api/apps/auth/issue-templates/[type] - The workspace's template for one issue type
 *
 * Required scopes: issues:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { userHasWorkspaceAccess } from '@/lib/issue-finder';
import { getWorkspaceTemplates } from '@/lib/issue-template-store';
import { templateFor, withBody } from '@/lib/issue-templates';

export const GET = withAppAuth(
  async (_request: NextRequest, context: AppAuthContext, routeParams: { params: Promise<{ type: string }> }) => {
    try {
      if (!await userHasWorkspaceAccess(context.user.id, context.workspace.id)) {
        return NextResponse.json(
          { error: 'workspace_access_denied', error_description: 'Active workspace access required' },
          { status: 403 }
        );
      }
      const { type } = await routeParams.params;
      const { enforced, templates } = await getWorkspaceTemplates(context.workspace.id);
      const template = templateFor(templates, type);
      if (!template) {
        return NextResponse.json(
          { error: 'template_not_found', error_description: 'This issue type has no template' },
          { status: 404 }
        );
      }
      return NextResponse.json({ ...withBody(template), enforced });
    } catch (error) {
      console.error('Error reading issue template:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['issues:read'] }
);
