import { withAppAuth } from '@/lib/apps/auth-middleware';
import { sendHandoff, sendSchema } from '@/lib/agent-handoffs';
import { handoffBody, handoffResponse } from '@/lib/agent-handoff-http';

export const POST = withAppAuth(async (request, context) => handoffResponse(async () =>
  sendHandoff(context, sendSchema.parse(await handoffBody(request)))), { requiredScopes: ['issues:read', 'issues:write'] });
