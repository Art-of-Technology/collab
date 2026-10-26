import { withAppAuth } from '@/lib/apps/auth-middleware';
import { heartbeatSchema, reportWatcher } from '@/lib/agent-handoffs';
import { handoffBody, handoffResponse } from '@/lib/agent-handoff-http';

export const POST = withAppAuth(async (request, context) => handoffResponse(async () =>
  reportWatcher(context, heartbeatSchema.parse(await handoffBody(request)))), { requiredScopes: ['issues:read'] });
