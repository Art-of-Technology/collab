import { withAppAuth } from '@/lib/apps/auth-middleware';
import { handoffResponse } from '@/lib/agent-handoff-http';
import { runContext } from '@/lib/agent-runs';

// GET /api/apps/auth/issues/:issueIdOrKey/run-context - what a fresh session needs to work the issue, in one read.
export const GET = withAppAuth(async (_request, context, { params }: { params: Promise<{ issueIdOrKey: string }> }) =>
  handoffResponse(async () => runContext(context, (await params).issueIdOrKey)), { requiredScopes: ['issues:read'] });
