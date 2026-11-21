import { withAppAuth } from '@/lib/apps/auth-middleware';
import { handoffResponse } from '@/lib/agent-handoff-http';
import { moveUnstarted } from '@/lib/agent-requests';
import { seatInbox } from '@/lib/agent-runs';

// GET /api/apps/auth/seats/me/inbox - what the caller should work on next, in order, each with its reason.
export const GET = withAppAuth(async (_request, context) => handoffResponse(async () => {
  // A request, or on a developer seat's read a story the lead cannot move (CLB-793), that cannot start where it is
  // moves first, so this read already lists it (CLB-780). The inbox is answered whatever becomes of that: the next read tries again.
  try { await moveUnstarted(context); } catch (error) { console.error('Moving unstarted requests failed', error); }
  return seatInbox(context);
}), { requiredScopes: ['issues:read'] });
