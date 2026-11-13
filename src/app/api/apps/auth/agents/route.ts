import { withAppAuth } from '@/lib/apps/auth-middleware';
import { listAgents, registerAgent, registrationSchema, retireAgent } from '@/lib/agent-handoffs';
import { handoffBody, handoffResponse } from '@/lib/agent-handoff-http';

export const GET = withAppAuth(async (_request, context) => handoffResponse(async () => ({ agents: await listAgents(context) })), { requiredScopes: ['issues:read'] });
export const POST = withAppAuth(async (request, context) => handoffResponse(async () =>
  registerAgent(context, registrationSchema.parse(await handoffBody(request)))), { requiredScopes: ['workspace:write', 'issues:read'] });
// Retiring an agent releases its claims (issues:write) and removes its registration (workspace:write).
export const DELETE = withAppAuth(async (request, context) => handoffResponse(async () =>
  retireAgent(context, new URL(request.url).searchParams.get('agent'), false)), { requiredScopes: ['workspace:write', 'issues:write'] });
