import { withAppAuth } from '@/lib/apps/auth-middleware';
import { handoffBody, handoffResponse } from '@/lib/agent-handoff-http';
import { fileRequest, requestSchema } from '@/lib/agent-requests';

// POST /api/apps/auth/seats/me/requests - a seat asks a seat of a role, in its own project or another, for work on one of its issues.
export const POST = withAppAuth(async (request, context) => handoffResponse(async () =>
  fileRequest(context, requestSchema.parse(await handoffBody(request)))), { requiredScopes: ['issues:write'], seatWrites: true });
