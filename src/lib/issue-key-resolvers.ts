import { prisma } from '@/lib/prisma';

/**
 * Resolve issue key to database ID
 * Now works with the unified Issue model
 * @param issueKey - The issue key (e.g., "COF-123")
 * @param workspaceId - Optional workspace ID to scope the search (required when same prefix exists in multiple workspaces)
 */
export async function resolveIssueKeyToId(issueKey: string, workspaceId?: string): Promise<string | null> {
  try {
    // Build where clause with optional workspace filtering
    const whereClause: { issueKey: string; workspaceId?: string } = { issueKey };
    if (workspaceId) {
      whereClause.workspaceId = workspaceId;
    }

    const issue = await prisma.issue.findFirst({
      where: whereClause,
      select: { id: true }
    });

    return issue?.id || null;
  } catch (error) {
    console.error('Error resolving issue key:', issueKey, error);
    return null;
  }
}

/**
 * Resolve database ID to issue key
 * Now works with the unified Issue model
 */
export async function resolveIdToIssueKey(id: string): Promise<string | null> {
  try {
    const issue = await prisma.issue.findUnique({
      where: { id },
      select: { issueKey: true }
    });

    return issue?.issueKey || null;
  } catch (error) {
    console.error('Error resolving ID:', id, error);
    return null;
  }
}

/**
 * Resolve issue ID or key to the actual issue
 * Accepts either a UUID or an issue key (like PROJ-123)
 * @param idOrKey - Either a UUID or an issue key
 * @param workspaceId - Optional workspace ID to scope the search (required when same prefix exists in multiple workspaces)
 */
export async function resolveIssueIdOrKey(idOrKey: string, workspaceId?: string): Promise<{ id: string; issueKey: string | null } | null> {
  try {
    // Check if it looks like a UUID (36 chars with dashes) or issue key
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrKey);

    // Build where clause with optional workspace filtering
    const whereClause: { id?: string; issueKey?: string; workspaceId?: string } = isUuid
      ? { id: idOrKey }
      : { issueKey: idOrKey };

    // Only add workspace filter for issue key lookups (UUID lookups are unique)
    if (workspaceId && !isUuid) {
      whereClause.workspaceId = workspaceId;
    }

    const issue = await prisma.issue.findFirst({
      where: whereClause,
      select: { id: true, issueKey: true }
    });

    return issue || null;
  } catch (error) {
    console.error('Error resolving issue:', idOrKey, error);
    return null;
  }
}
