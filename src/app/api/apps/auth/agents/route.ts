import { withAppAuth } from '@/lib/apps/auth-middleware';
import { listAgents, registerAgent, registrationSchema } from '@/lib/agent-handoffs';
import { handoffBody, handoffResponse } from '@/lib/agent-handoff-http';

export const GET = withAppAuth(async (_request, context) => handoffResponse(async () => ({ agents: await listAgents(context) })), { requiredScopes: ['issues:read'] });
export const POST = withAppAuth(async (request, context) => handoffResponse(async () =>
  registerAgent(context, registrationSchema.parse(await handoffBody(request)))), { requiredScopes: ['workspace:write', 'issues:read'] });
