/**
 * Client-side utilities for resolving between issue keys and database IDs
 * These functions call the API endpoint since Prisma can't run in the browser
 */

/**
 * Resolve issue key to database ID (client-side)
 * @param issueKey - The issue key (e.g., "COF-123")
 * @param workspaceId - Optional workspace ID to scope the search (required when same prefix exists in multiple workspaces)
 */
export async function resolveIssueKeyToId(issueKey: string, workspaceId?: string): Promise<string | null> {
  try {
    let url = `/api/resolve-issue-key?value=${encodeURIComponent(issueKey)}&action=toId`;
    if (workspaceId) {
      url += `&workspaceId=${encodeURIComponent(workspaceId)}`;
    }

    const response = await fetch(url);

    if (!response.ok) {
      console.error(`Failed to resolve issue key ${issueKey}:`, response.statusText);
      return null;
    }

    const data = await response.json();
    return data.result;
  } catch (error) {
    console.error(`Error resolving issue key ${issueKey}:`, error);
    return null;
  }
}

/**
 * Resolve database ID to issue key (client-side)
 */
export async function resolveIdToIssueKey(id: string): Promise<string | null> {
  try {
    const response = await fetch(`/api/resolve-issue-key?value=${encodeURIComponent(id)}&action=toIssueKey`);

    if (!response.ok) {
      console.error(`Failed to resolve ID ${id}:`, response.statusText);
      return null;
    }

    const data = await response.json();
    return data.result;
  } catch (error) {
    console.error(`Error resolving ID ${id}:`, error);
    return null;
  }
}

/**
 * Resolve issue ID or key to get both the ID and issue key (client-side)
 * @param idOrKey - Either a UUID or an issue key
 * @param workspaceId - Optional workspace ID to scope the search
 */
export async function resolveIssueIdOrKey(idOrKey: string, workspaceId?: string): Promise<{ id: string; issueKey: string | null } | null> {
  try {
    let url = `/api/resolve-issue-key?value=${encodeURIComponent(idOrKey)}&action=resolve`;
    if (workspaceId) {
      url += `&workspaceId=${encodeURIComponent(workspaceId)}`;
    }

    const response = await fetch(url);

    if (!response.ok) {
      console.error(`Failed to resolve issue ${idOrKey}:`, response.statusText);
      return null;
    }

    const data = await response.json();
    return data.result;
  } catch (error) {
    console.error(`Error resolving issue ${idOrKey}:`, error);
    return null;
  }
}
