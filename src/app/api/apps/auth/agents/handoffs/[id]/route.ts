import { withAppAuth } from '@/lib/apps/auth-middleware';
import { actOnHandoff, actionSchema, getHandoff, inboxSchema } from '@/lib/agent-handoffs';
import { handoffBody, handoffResponse } from '@/lib/agent-handoff-http';

type Params = { params: Promise<{ id: string }> };
export const GET = withAppAuth(async (request, context, { params }: Params) => handoffResponse(async () => {
  const { agent } = inboxSchema.parse({ agent: new URL(request.url).searchParams.get('agent') });
  return getHandoff(context, agent, (await params).id);
}), { requiredScopes: ['issues:read'] });
export const PATCH = withAppAuth(async (request, context, { params }: Params) => handoffResponse(async () =>
  actOnHandoff(context, (await params).id, actionSchema.parse(await handoffBody(request)))), { requiredScopes: ['issues:read'] });
