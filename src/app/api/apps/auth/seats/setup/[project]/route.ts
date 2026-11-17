import { withAppAuth } from '@/lib/apps/auth-middleware';
import { handoffBody, handoffResponse } from '@/lib/agent-handoff-http';
import { seatSetupState, setupSchema, setupSeats } from '@/lib/agent-seat-setup';

type Params = { params: Promise<{ project: string }> };

// GET /api/apps/auth/seats/setup/:project - what giving this project its seats would do. It changes nothing.
export const GET = withAppAuth(async (_request, context, { params }: Params) =>
  handoffResponse(async () => seatSetupState(context, (await params).project)), { requiredScopes: ['workspace:read'] });

// POST - create the missing seats for the runner, switch the project to seats and carry the chosen claims over.
export const POST = withAppAuth(async (request, context, { params }: Params) =>
  handoffResponse(async () => setupSeats(context, (await params).project, setupSchema.parse(await handoffBody(request)))),
  { requiredScopes: ['workspace:write'] });
