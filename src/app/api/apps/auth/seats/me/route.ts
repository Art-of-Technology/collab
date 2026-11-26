import { withAppAuth } from '@/lib/apps/auth-middleware';
import { handoffResponse } from '@/lib/agent-handoff-http';
import { HandoffError } from '@/lib/agent-seats';
import { prisma } from '@/lib/prisma';

// GET /api/apps/auth/seats/me - the seat behind this token, its scope, and its project: null for a seat of the whole workspace (CLB-613).
export const GET = withAppAuth(async (_request, context) => handoffResponse(async () => {
  // Read here rather than with requireSeat, which refuses a seat without a project: this read is the one it may do.
  const seat = await prisma.agentSeat.findFirst({ where: { userId: context.user.id, retiredAt: null } });
  if (!seat) throw new HandoffError('seat_required', 'This call needs a seat token', 403);
  const { id, projectId, role, ownerId, name, isDefault } = seat;
  const project = projectId === null ? null
    : await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { id: true, name: true, issuePrefix: true, agentMode: true } });
  return { seat: { id, projectId, role, ownerId, name, isDefault }, scope: projectId === null ? 'workspace' : 'project', project };
}));
