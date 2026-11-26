import { prisma } from '@/lib/prisma';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import { issueAccessWhere } from '@/lib/issue-finder';
import { checkUserPermission, Permission } from '@/lib/permissions';
import { layerText } from '@/lib/agent-role-catalogue';
import { seatOwnerAccess } from '@/lib/workspace-authority';

/**
 * A seat's own page (CLB-610): the seat, with its own instructions, the seat layer of its runs. Whoever sees the seat on the
 * Seats tab reads it. `canEdit` is true for someone with MANAGE_AGENTS, as for creating and
 * retiring a seat, unless the reader is the seat's own account: a seat never writes its own instructions. Null when the
 * workspace is not the person's or the seat is not a live seat there that the person may see.
 */
export async function readSeatPage(userId: string, workspaceIdOrSlug: string, seatId: string) {
  const workspace = await prisma.workspace.findFirst({ where: postWorkspaceAccessWhere(userId, workspaceIdOrSlug), select: { id: true, slug: true } });
  if (!workspace) return null;
  const seat = await prisma.agentSeat.findFirst({
    where: { id: seatId, workspaceId: workspace.id, retiredAt: null, project: { workspaceId: workspace.id, ...issueAccessWhere(userId) } },
    select: { id: true, userId: true, name: true, role: true, instructions: true, project: { select: { name: true } }, owner: { select: { id: true, name: true, email: true } },
      customRole: { select: { name: true } } },
  });
  // The filter on the project already leaves out a seat without one; this page shows a project seat only.
  if (!seat?.project) return null;
  const { hasPermission } = await checkUserPermission(userId, workspace.id, Permission.MANAGE_AGENTS);
  // What saving would answer: someone else's seat needs the rank rule as well (CLB-1185), read only then.
  const canEdit = hasPermission && seat.userId !== userId && (await seatOwnerAccess(userId, workspace.id, seat.owner?.id ?? null))() === 'pass';
  return {
    workspace, canEdit,
    seat: { id: seat.id, name: seat.name, role: seat.role, customRole: seat.customRole?.name ?? null, project: seat.project.name, instructions: seat.instructions ?? '',
      owner: seat.owner ? seat.owner.name || seat.owner.email || seat.owner.id : null },
  };
}

/**
 * Saves a seat's own instructions, trimmed; empty text removes them. Requires MANAGE_AGENTS and a live seat in the
 * workspace. The seat's own account cannot edit it. The text must fit within the seat layer's limit.
 */
export async function saveSeatInstructions(userId: string, workspaceId: string, seatId: string, text: string) {
  const { hasPermission } = await checkUserPermission(userId, workspaceId, Permission.MANAGE_AGENTS);
  if (!hasPermission) return { error: 'forbidden' as const };
  // A system admin passes the check above for any id, so the seat is looked up in the workspace named.
  const seat = await prisma.agentSeat.findFirst({ where: { id: seatId, workspaceId, retiredAt: null }, select: { id: true, userId: true, ownerId: true } });
  if (!seat) return { error: 'not_found' as const };
  if (seat.userId === userId) return { error: 'forbidden' as const };
  // Someone else's seat needs the rank rule as well (CLB-1185), decided on the seat's person as read above.
  if ((await seatOwnerAccess(userId, workspaceId, seat.ownerId))() === 'refused') return { error: 'outranked' as const };
  let trimmed: string;
  // The only thing layerText throws is that the text is over the limit.
  try { trimmed = layerText('seat', text); } catch (error) { return { error: 'too_long' as const, message: (error as Error).message }; }
  // Written only while the seat is live with the person read above: otherwise it reads as not found.
  if (!(await prisma.agentSeat.updateMany({ where: { id: seat.id, ownerId: seat.ownerId, retiredAt: null }, data: { instructions: trimmed || null } })).count) return { error: 'not_found' as const };
  return { seat: seat.id, text: trimmed };
}
