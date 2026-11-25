import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { ROLE_CATALOGUE, layerText } from '@/lib/agent-role-catalogue';

/** The longest reason a version may give, counted after trimming. */
export const REASON_LIMIT = 300;

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const ENTRY = { id: true, role: true, version: true, text: true, reason: true, shippedSha256: true, createdAt: true, createdBy: { select: { id: true, name: true } } } as const;
type Entry = { id: string; role: string; version: number; text: string | null; reason: string; shippedSha256: string; createdAt: Date; createdBy: { id: string; name: string | null } | null };
type Role = (typeof ROLE_CATALOGUE.roles)[number];

/**
 * One role as the admin Roles page shows it (CLB-916): the text the repository ships, the text in force and where it comes
 * from, and every saved version, newest first. `shippedNewer` says a release changed the repository's text since the edit
 * in force was saved; the edit stays in force.
 */
function roleView(role: Role, entries: Entry[]) {
  const latest = entries[0];
  const history = entries.map(entry => ({ id: entry.id, version: entry.version, text: entry.text, reason: entry.reason, by: entry.createdBy, at: entry.createdAt }));
  const inForce = latest?.text != null
    ? { source: 'edit' as const, text: latest.text, version: latest.version, reason: latest.reason, by: latest.createdBy, at: latest.createdAt,
      shippedNewer: latest.shippedSha256 !== sha256(role.platformPrompt) }
    : { source: 'repository' as const, text: role.platformPrompt };
  return { id: role.id, name: role.name, repository: role.platformPrompt, inForce, history };
}

/** Every role of the catalogue with its platform prompt in force and its history. Only a system admin may be shown it. */
export async function readPlatformPrompts() {
  const entries: Entry[] = await prisma.agentPlatformPrompt.findMany({ orderBy: [{ role: 'asc' }, { version: 'desc' }], select: ENTRY });
  return { roles: ROLE_CATALOGUE.roles.map(role => roleView(role, entries.filter(entry => entry.role === role.id))) };
}

export type PlatformPromptChange =
  | { action: 'save'; text: string; reason: string }
  | { action: 'restore'; versionId: string; reason: string }
  | { action: 'repository'; reason: string };

/**
 * Adds a version of one role's platform prompt, by a system admin the caller has checked: a new text, an earlier version
 * again, or the repository's text again (a null text). No version is ever changed or removed. Refused: a role outside the
 * catalogue, an empty text or one over the platform layer's limit, a reason that is empty, longer than one line or over
 * its limit, a version of another role, and a change that leaves the text in force as it is. Two saves at once cannot take
 * the same version: the second is refused as a conflict.
 */
export async function savePlatformPrompt(adminId: string, roleId: string, change: PlatformPromptChange) {
  const role = ROLE_CATALOGUE.getRole(roleId);
  if (!role) return { error: 'unknown_role' as const };
  const reason = change.reason.trim();
  if (!reason || /[\r\n]/.test(reason) || reason.length > REASON_LIMIT) {
    return { error: 'invalid' as const, message: `Say why in one line of at most ${REASON_LIMIT} characters` };
  }
  let text: string | null;
  if (change.action === 'save') {
    // The only thing layerText throws is that the text is over the limit.
    try { text = layerText('platform', change.text); } catch (error) { return { error: 'invalid' as const, message: (error as Error).message }; }
    if (!text) return { error: 'invalid' as const, message: 'The platform prompt cannot be empty' };
  } else if (change.action === 'restore') {
    const earlier = await prisma.agentPlatformPrompt.findFirst({ where: { id: change.versionId, role: role.id }, select: { text: true } });
    if (!earlier) return { error: 'unknown_version' as const };
    text = earlier.text;
  } else {
    text = null;
  }
  const latest = await prisma.agentPlatformPrompt.findFirst({ where: { role: role.id }, orderBy: { version: 'desc' }, select: { version: true, text: true } });
  // The edit in force again, or the repository's text while it is in force, changes nothing.
  if ((latest?.text ?? null) === text) return { error: 'unchanged' as const };
  try {
    await prisma.agentPlatformPrompt.create({ data: { role: role.id, version: (latest?.version ?? 0) + 1, text, reason,
      shippedSha256: sha256(role.platformPrompt), createdById: adminId } });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') return { error: 'conflict' as const };
    throw error;
  }
  const entries: Entry[] = await prisma.agentPlatformPrompt.findMany({ where: { role: role.id }, orderBy: { version: 'desc' }, select: ENTRY });
  return { role: roleView(role, entries) };
}
