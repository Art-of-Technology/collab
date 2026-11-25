import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { checkUserPermission, Permission } from '@/lib/permissions';
import { ROLE_CATALOGUE, layerText } from '@/lib/agent-role-catalogue';

/** The longest name of a custom role, after trimming. */
export const CUSTOM_ROLE_NAME_LIMIT = 60;

export const CUSTOM_ROLE_SELECT = { id: true, name: true, baseRole: true, instructions: true, retiredAt: true, _count: { select: { seats: true } } } as const;

/** A custom role as the Roles page and the routes show it: `seats` counts every seat that has it, retired ones too. */
export function customRoleView(row: Prisma.AgentCustomRoleGetPayload<{ select: typeof CUSTOM_ROLE_SELECT }>) {
  return { id: row.id, name: row.name, baseRole: row.baseRole, baseName: ROLE_CATALOGUE.getRole(row.baseRole)?.name ?? row.baseRole,
    instructions: row.instructions, retired: !!row.retiredAt, seats: row._count.seats };
}

type Refusal =
  | { error: 'forbidden' | 'not_found' | 'unknown_role' | 'has_seats' }
  | { error: 'invalid_name' | 'built_in_name' | 'name_taken' | 'too_long'; message: string };

const REFUSALS = {
  forbidden: [403, 'Forbidden'],
  not_found: [404, 'Not found'],
  unknown_role: [400, 'There is no such role in the catalogue'],
  has_seats: [409, 'Seats have this role, so it cannot be deleted. Retire it instead: no new seat takes it.'],
  invalid_name: [400, ''],
  built_in_name: [409, ''],
  name_taken: [409, ''],
  too_long: [400, ''],
} as const;

/** The HTTP status and body of a refusal: its words and its code. */
export function customRoleRefusal(result: Refusal) {
  const [status, error] = REFUSALS[result.error];
  return { status, body: { error: 'message' in result ? result.message : error, code: result.error } };
}

/** Whether `userId` may manage the workspace's roles, and the workspace exists: a system admin passes the check for any id. */
async function mayManage(userId: string, workspaceId: string) {
  const { hasPermission } = await checkUserPermission(userId, workspaceId, Permission.MANAGE_AGENTS);
  if (!hasPermission) return { error: 'forbidden' as const };
  if (!await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } })) return { error: 'not_found' as const };
  return null;
}

/**
 * The name to save, trimmed, or why it cannot be: empty or too long, a built-in role's name or id in any case, or the name
 * of another of the workspace's roles in any case.
 */
async function checkName(workspaceId: string, name: string, except?: string): Promise<{ name: string } | Refusal> {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > CUSTOM_ROLE_NAME_LIMIT) return { error: 'invalid_name', message: `A role's name has 1 to ${CUSTOM_ROLE_NAME_LIMIT} characters` };
  const lower = trimmed.toLowerCase();
  const builtIn = ROLE_CATALOGUE.roles.find(role => role.name.toLowerCase() === lower || role.id.toLowerCase() === lower);
  if (builtIn) return { error: 'built_in_name', message: `“${builtIn.name}” is the name of a built-in role` };
  const taken = await prisma.agentCustomRole.findFirst({ where: { workspaceId, name: { equals: trimmed, mode: 'insensitive' }, ...(except && { id: { not: except } }) }, select: { id: true } });
  if (taken) return { error: 'name_taken', message: 'Your organisation already has a role of that name' };
  return { name: trimmed };
}

/** The instructions to save, trimmed, or the refusal when they are over the role layer's limit. */
function checkInstructions(text: string): { text: string } | Refusal {
  // The only thing layerText throws is that the text is over the limit.
  try { return { text: layerText('role', text) }; } catch (error) { return { error: 'too_long', message: (error as Error).message }; }
}

/** A unique-name race lost to a concurrent save reads as the name being taken. */
function nameRace(error: unknown): Refusal {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return { error: 'name_taken', message: 'Your organisation already has a role of that name' };
  throw error;
}

/**
 * Adds a role of the workspace's own (CLB-626): a name, the built-in role it behaves like, and its instructions, the role
 * layer of its seats' runs. Only someone who may manage the workspace's permissions may.
 */
export async function createCustomRole(userId: string, workspaceId: string, input: { name: string; baseRole: string; instructions: string }) {
  const denied = await mayManage(userId, workspaceId);
  if (denied) return denied;
  if (!ROLE_CATALOGUE.getRole(input.baseRole)) return { error: 'unknown_role' as const };
  const name = await checkName(workspaceId, input.name);
  if ('error' in name) return name;
  const instructions = checkInstructions(input.instructions);
  if ('error' in instructions) return instructions;
  try {
    const row = await prisma.agentCustomRole.create({ data: { workspaceId, name: name.name, baseRole: input.baseRole, instructions: instructions.text, createdById: userId }, select: CUSTOM_ROLE_SELECT });
    return { role: customRoleView(row) };
  } catch (error) { return nameRace(error); }
}

/**
 * Changes a role's name or instructions, or retires it so that no new seat takes it (`retired: false` brings it back). Its
 * base role stays: the seats that have it keep the base role they were made with. The seats that have a retired role keep
 * it and its layer.
 */
export async function updateCustomRole(userId: string, workspaceId: string, roleId: string, input: { name?: string; instructions?: string; retired?: boolean }) {
  const denied = await mayManage(userId, workspaceId);
  if (denied) return denied;
  const existing = await prisma.agentCustomRole.findFirst({ where: { id: roleId, workspaceId }, select: { id: true, retiredAt: true } });
  if (!existing) return { error: 'not_found' as const };
  const data: Prisma.AgentCustomRoleUpdateInput = {};
  if (input.name !== undefined) {
    const name = await checkName(workspaceId, input.name, roleId);
    if ('error' in name) return name;
    data.name = name.name;
  }
  if (input.instructions !== undefined) {
    const instructions = checkInstructions(input.instructions);
    if ('error' in instructions) return instructions;
    data.instructions = instructions.text;
  }
  // Retiring again keeps the first date.
  if (input.retired !== undefined) data.retiredAt = input.retired ? existing.retiredAt ?? new Date() : null;
  try {
    const row = await prisma.agentCustomRole.update({ where: { id: roleId }, data, select: CUSTOM_ROLE_SELECT });
    return { role: customRoleView(row) };
  } catch (error) { return nameRace(error); }
}

/**
 * Deletes a role that no seat has, retired seats included. A role with seats is refused: it is retired instead. The seats'
 * foreign key refuses the delete too, should a seat take the role between the check and the delete.
 */
export async function deleteCustomRole(userId: string, workspaceId: string, roleId: string) {
  const denied = await mayManage(userId, workspaceId);
  if (denied) return denied;
  const existing = await prisma.agentCustomRole.findFirst({ where: { id: roleId, workspaceId }, select: { id: true, _count: { select: { seats: true } } } });
  if (!existing) return { error: 'not_found' as const };
  if (existing._count.seats) return { error: 'has_seats' as const };
  try {
    await prisma.agentCustomRole.delete({ where: { id: roleId } });
  } catch (error) {
    // P2003: a seat took the role after the check. P2025: a concurrent delete removed it first.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') return { error: 'has_seats' as const };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return { error: 'not_found' as const };
    throw error;
  }
  return { deleted: roleId };
}
