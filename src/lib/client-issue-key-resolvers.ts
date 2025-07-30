/**
 * Client-side utilities for resolving between issue keys and database IDs
 * These functions call the API endpoint since Prisma can't run in the browser
 */

/**
 * Resolve issue key to database ID for various entity types (client-side)
 */
export async function resolveIssueKeyToId(issueKey: string, entityType: 'task' | 'epic' | 'story' | 'milestone'): Promise<string | null> {
  try {
    const response = await fetch(`/api/resolve-issue-key?value=${encodeURIComponent(issueKey)}&entityType=${entityType}&action=toId`);
    
    if (!response.ok) {
      console.error(`Failed to resolve issue key ${issueKey}:`, response.statusText);
      return null;
    }
    
    const data = await response.json();
    return data.result;
  } catch (error) {
    console.error(`Error resolving issue key ${issueKey} for ${entityType}:`, error);
    return null;
  }
}

/**
 * Resolve database ID to issue key for various entity types (client-side)
 */
export async function resolveIdToIssueKey(id: string, entityType: 'task' | 'epic' | 'story' | 'milestone'): Promise<string | null> {
  try {
    const response = await fetch(`/api/resolve-issue-key?value=${encodeURIComponent(id)}&entityType=${entityType}&action=toIssueKey`);
    
    if (!response.ok) {
      console.error(`Failed to resolve ID ${id}:`, response.statusText);
      return null;
    }
    
    const data = await response.json();
    return data.result;
  } catch (error) {
    console.error(`Error resolving ID ${id} for ${entityType}:`, error);
    return null;
  }
}

 