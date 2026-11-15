import { withAppAuth } from '@/lib/apps/auth-middleware';
import { handoffBody, handoffResponse } from '@/lib/agent-handoff-http';
import { actOnRun, getRun, runActionSchema } from '@/lib/agent-runs';

type Params = { params: Promise<{ id: string }> };
// GET /api/apps/auth/runs/:id - the caller's run.
export const GET = withAppAuth(async (_request, context, { params }: Params) => handoffResponse(async () =>
  getRun(context, (await params).id)), { requiredScopes: ['issues:read'] });
// PATCH /api/apps/auth/runs/:id - renew the lease, finish with an exit note, or close: the runner confirms the session is gone.
export const PATCH = withAppAuth(async (request, context, { params }: Params) => handoffResponse(async () =>
  actOnRun(context, (await params).id, runActionSchema.parse(await handoffBody(request)))), { requiredScopes: ['issues:write'], seatWrites: true });
