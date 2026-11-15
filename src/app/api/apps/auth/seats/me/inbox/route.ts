import { withAppAuth } from '@/lib/apps/auth-middleware';
import { handoffResponse } from '@/lib/agent-handoff-http';
import { seatInbox } from '@/lib/agent-runs';

// GET /api/apps/auth/seats/me/inbox - what the caller should work on next, in order, each with its reason.
export const GET = withAppAuth(async (_request, context) => handoffResponse(() => seatInbox(context)), { requiredScopes: ['issues:read'] });
