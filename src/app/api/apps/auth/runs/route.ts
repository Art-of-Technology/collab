import { withAppAuth } from '@/lib/apps/auth-middleware';
import { handoffBody, handoffResponse } from '@/lib/agent-handoff-http';
import { checkout, checkoutSchema } from '@/lib/agent-runs';

// POST /api/apps/auth/runs - take an issue assigned to the caller: one run per issue, with a lease for a seat.
export const POST = withAppAuth(async (request, context) => handoffResponse(async () =>
  checkout(context, checkoutSchema.parse(await handoffBody(request)))), { requiredScopes: ['issues:write'], seatWrites: true });
