import { prisma } from '@/lib/prisma';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import { checkUserPermission, Permission } from '@/lib/permissions';
import { ROLE_CATALOGUE, layerText } from '@/lib/agent-role-catalogue';
import { CUSTOM_ROLE_SELECT, customRoleView } from '@/lib/agent-custom-roles';

/** What a role of the catalogue takes, in words: ordinary issues, then each kind of request. */
const takes = (role: (typeof ROLE_CATALOGUE.roles)[number]) => [
  ...(role.takesOrdinaryIssues ? ['Ordinary issues'] : []),
  ...role.requests.map(request => ('label' in request && request.label) || `${request.id[0].toUpperCase()}${request.id.slice(1)} request`),
];

/**
 * The Roles page of a workspace (CLB-608): each role of the catalogue with its platform layer in force (CLB-916), as a run
 * gets it with no one owner named, and the organisation's own text; then the workspace's own roles (CLB-626), retired
 * ones too, by name. Every member reads it, as every member sees the seats; `canEdit` is true for those who may manage the
 * workspace's permissions. Null when the person is not in the workspace.
 */
export async function readRoleInstructions(userId: string, workspaceIdOrSlug: string) {
  const workspace = await prisma.workspace.findFirst({ where: postWorkspaceAccessWhere(userId, workspaceIdOrSlug), select: { id: true, slug: true, name: true } });
  if (!workspace) return null;
  const [{ hasPermission }, rows, edits, custom] = await Promise.all([
    checkUserPermission(userId, workspace.id, Permission.MANAGE_AGENTS),
    prisma.agentRoleInstructions.findMany({ where: { workspaceId: workspace.id }, select: { role: true, text: true } }),
    // The latest version of each role's platform prompt that a system admin saved (CLB-916).
    prisma.agentPlatformPrompt.findMany({ orderBy: [{ role: 'asc' }, { version: 'desc' }], distinct: ['role'], select: { role: true, text: true } }),
    prisma.agentCustomRole.findMany({ where: { workspaceId: workspace.id }, orderBy: { name: 'asc' }, select: CUSTOM_ROLE_SELECT }),
  ]);
  const saved = new Map(rows.map(row => [row.role, row.text]));
  const platform = new Map(edits.map(row => [row.role, row.text]));
  return {
    workspace,
    canEdit: hasPermission,
    roles: ROLE_CATALOGUE.roles.map(role => ({ id: role.id, name: role.name, takes: takes(role), repository: role.repository,
      platform: ROLE_CATALOGUE.instructionLayers(role.id, { ownerId: null, platform: platform.get(role.id) })[0].text, organisation: saved.get(role.id) ?? '' })),
    custom: custom.map(customRoleView),
  };
}

/**
 * Saves the organisation layer of one role for the workspace, trimmed. Empty text removes it. Only someone who may manage
 * the workspace's permissions may; the role must be in the catalogue and the text within the layer's limit.
 */
export async function saveRoleInstructions(userId: string, workspaceId: string, roleId: string, text: string) {
  const { hasPermission } = await checkUserPermission(userId, workspaceId, Permission.MANAGE_AGENTS);
  if (!hasPermission) return { error: 'forbidden' as const };
  // A system admin passes the check above for any id, so the workspace is looked up too.
  if (!await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } })) return { error: 'not_found' as const };
  if (!ROLE_CATALOGUE.getRole(roleId)) return { error: 'unknown_role' as const };
  let trimmed: string;
  // The only thing layerText throws is that the text is over the limit.
  try { trimmed = layerText('organisation', text); } catch (error) { return { error: 'too_long' as const, message: (error as Error).message }; }
  const where = { workspaceId_role: { workspaceId, role: roleId } };
  if (trimmed) await prisma.agentRoleInstructions.upsert({ where, create: { workspaceId, role: roleId, text: trimmed, updatedById: userId }, update: { text: trimmed, updatedById: userId } });
  else await prisma.agentRoleInstructions.deleteMany({ where: { workspaceId, role: roleId } });
  return { role: roleId, text: trimmed };
}
