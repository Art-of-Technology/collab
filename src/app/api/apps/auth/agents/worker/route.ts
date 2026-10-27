import { withAppAuth } from '@/lib/apps/auth-middleware';
import { workerSchema, manageWorker, getOwnedAgent } from '@/lib/agent-handoffs';
import { handoffBody, handoffResponse } from '@/lib/agent-handoff-http';

export const GET = withAppAuth(async (request, context) => handoffResponse(async () =>
  ({ agent: await getOwnedAgent(context, request.nextUrl.searchParams.get('agent')) })), { requiredScopes: ['issues:read'] });

export const POST = withAppAuth(async (request, context) => handoffResponse(async () =>
  manageWorker(context, workerSchema.parse(await handoffBody(request)))), { requiredScopes: ['issues:write'] });
