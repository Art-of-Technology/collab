import { prisma } from '@/lib/prisma';

/**
 * Resolve issue key to database ID
 * Now works with the unified Issue model
 */
export async function resolveIssueKeyToId(issueKey: string): Promise<string | null> {
  try {
    const issue = await prisma.issue.findFirst({
      where: { issueKey },
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
 */
export async function resolveIssueIdOrKey(idOrKey: string): Promise<{ id: string; issueKey: string | null } | null> {
  try {
    // Check if it looks like a UUID (36 chars with dashes) or issue key
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrKey);

    const issue = await prisma.issue.findFirst({
      where: isUuid
        ? { id: idOrKey }
        : { issueKey: idOrKey },
      select: { id: true, issueKey: true }
    });

    return issue || null;
  } catch (error) {
    console.error('Error resolving issue:', idOrKey, error);
    return null;
  }
}
