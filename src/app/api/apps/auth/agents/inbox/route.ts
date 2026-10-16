import { withAppAuth } from '@/lib/apps/auth-middleware';
import { agentInbox, inboxSchema } from '@/lib/agent-handoffs';
import { handoffResponse } from '@/lib/agent-handoff-http';

export const GET = withAppAuth(async (request, context) => handoffResponse(async () => {
  const params = new URL(request.url).searchParams;
  params.delete('workspace'); params.delete('workspaceId');
  return agentInbox(context, inboxSchema.parse(Object.fromEntries(params)));
}), { requiredScopes: ['issues:read'] });
