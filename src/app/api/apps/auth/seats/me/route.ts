import { withAppAuth } from '@/lib/apps/auth-middleware';
import { handoffResponse } from '@/lib/agent-handoff-http';
import { requireSeat } from '@/lib/agent-seats';
import { prisma } from '@/lib/prisma';

// GET /api/apps/auth/seats/me - the seat behind this token and its project.
export const GET = withAppAuth(async (_request, context) => handoffResponse(async () => {
  const { id, projectId, role, ownerId, name, isDefault } = await requireSeat(prisma, context);
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { id: true, name: true, issuePrefix: true, agentMode: true } });
  return { seat: { id, projectId, role, ownerId, name, isDefault }, project };
}));
