import { withAppAuth } from '@/lib/apps/auth-middleware';
import { workerSchema, manageWorker } from '@/lib/agent-handoffs';
import { handoffBody, handoffResponse } from '@/lib/agent-handoff-http';

export const POST = withAppAuth(async (request, context) => handoffResponse(async () =>
  manageWorker(context, workerSchema.parse(await handoffBody(request)))), { requiredScopes: ['issues:write'] });
