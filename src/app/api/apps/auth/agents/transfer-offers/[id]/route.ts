import { withAppAuth } from '@/lib/apps/auth-middleware';
import { actOnTransferOffer, transferOfferActionSchema } from '@/lib/agent-handoffs';
import { handoffBody, handoffResponse } from '@/lib/agent-handoff-http';

type Params = { params: Promise<{ id: string }> };
export const PATCH = withAppAuth(async (request, context, { params }: Params) => handoffResponse(async () =>
  actOnTransferOffer(context, (await params).id, transferOfferActionSchema.parse(await handoffBody(request)))), { requiredScopes: ['issues:read', 'issues:write'] });
