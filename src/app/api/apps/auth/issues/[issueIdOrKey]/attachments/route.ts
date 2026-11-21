/**
 * Third-Party App API: Issue attachments
 * POST /api/apps/auth/issues/:issueIdOrKey/attachments - attach a file to an issue
 *
 * Body: { name, contentBase64 }. The file becomes a Context file in the project's "Issue attachments"
 * folder; the reply has the file and the Markdown that shows it in a description or a comment.
 *
 * Required scopes: issues:write and context:write
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { HandoffError, seatWriteGuard } from '@/lib/agent-seats';
import { ForgeProjectWriteError, assertLegacyIssueWriteAllowed } from '@/lib/forge/legacy-write-guard';
import { agentContextFailure } from '@/lib/agent-context-folders';
import { attachToIssue } from '@/lib/issue-attachments';
import { withRateLimit, mediaUploadRateLimit } from '@/lib/rate-limit';

export const POST = withRateLimit(withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ issueIdOrKey: string }> }) => {
    try {
      const { issueIdOrKey } = await params;
      const issue = await prisma.issue.findFirst({
        where: { workspaceId: context.workspace.id, OR: [{ id: issueIdOrKey }, { issueKey: issueIdOrKey }] },
        select: { id: true, workspaceId: true, projectId: true, agentRequestRole: true, reporterId: true },
      });
      if (!issue) {
        return NextResponse.json({ error: 'not_found', error_description: 'Issue not found' }, { status: 404 });
      }
      // The same rule as a comment: a seat attaches to its own project's issues, and to a request it filed.
      await seatWriteGuard(prisma, context, issue.projectId, issue);
      await assertLegacyIssueWriteAllowed(issue.id);

      const body = await request.json().catch(() => null);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return NextResponse.json({ error: 'invalid_request', error_description: 'Expected a JSON object with name and contentBase64' }, { status: 400 });
      }
      const attached = await attachToIssue(context.user.id, issue, body as { name?: unknown; contentBase64?: unknown });
      return NextResponse.json(attached, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
      if (error instanceof HandoffError) {
        return NextResponse.json({ error: error.code, error_description: error.message }, { status: error.status });
      }
      if (error instanceof ForgeProjectWriteError) {
        return NextResponse.json({ error: 'forge_connected_project', error_description: error.message }, { status: 409 });
      }
      const failure = agentContextFailure(error);
      return NextResponse.json(failure.body, { status: failure.status });
    }
  },
  { requiredScopes: ['issues:write', 'context:write'], seatWrites: true },
), mediaUploadRateLimit);
