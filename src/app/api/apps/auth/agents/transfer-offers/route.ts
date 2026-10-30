import { withAppAuth } from '@/lib/apps/auth-middleware';
import { createTransferOffer, listTransferOffers, transferOfferListSchema, transferOfferSchema } from '@/lib/agent-handoffs';
import { handoffBody, handoffResponse } from '@/lib/agent-handoff-http';

export const GET = withAppAuth(async (request, context) => handoffResponse(async () => {
  const params = new URL(request.url).searchParams;
  params.delete('workspace'); params.delete('workspaceId');
  return listTransferOffers(context, transferOfferListSchema.parse(Object.fromEntries(params)));
}), { requiredScopes: ['issues:read'] });
export const POST = withAppAuth(async (request, context) => handoffResponse(async () =>
  createTransferOffer(context, transferOfferSchema.parse(await handoffBody(request)))), { requiredScopes: ['issues:read', 'issues:write'] });
