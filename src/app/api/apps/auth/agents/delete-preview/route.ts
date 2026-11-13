import { withAppAuth } from '@/lib/apps/auth-middleware';
import { retireAgent } from '@/lib/agent-handoffs';
import { handoffResponse } from '@/lib/agent-handoff-http';

// What retiring this agent would release and leave unowned. Changes nothing.
export const GET = withAppAuth(async (request, context) => handoffResponse(async () =>
  retireAgent(context, new URL(request.url).searchParams.get('agent'), true)), { requiredScopes: ['issues:read'] });
