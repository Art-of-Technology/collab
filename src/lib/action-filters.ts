import type { ActionFilter } from '@/components/views/selectors/ActionFiltersSelector';

/**
 * Client-side helper functions for action filters
 * (Server-side logic moved to API endpoints)
 */

/**
 * Get issue IDs that match the given action filters via API
 */
export async function getIssueIdsByActionFilters(
  workspaceId: string, 
  actionFilters: ActionFilter[]
): Promise<string[]> {
  if (!actionFilters.length) {
    return [];
  }

  try {
    const response = await fetch(`/api/workspaces/${workspaceId}/action-filter-issues`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ actionFilters })
    });

    if (!response.ok) {
      throw new Error(`Failed to filter by actions: ${response.statusText}`);
    }

    const data = await response.json();
    return data.issueIds || [];
  } catch (error) {
    console.error('Error fetching action-filtered issue IDs:', error);
    return [];
  }
}

/**
 * Apply action filters to a list of issues (client-side filtering)
 */
export async function filterIssuesByActions(
  issues: any[], 
  actionFilters: ActionFilter[]
): Promise<any[]> {
  if (!actionFilters.length) {
    return issues;
  }

  if (!issues.length) {
    return [];
  }

  // Get issue IDs that match the action filters
  const matchingIssueIds = await getIssueIdsByActionFilters(
    issues[0]?.workspaceId || '',
    actionFilters
  );

  // Filter issues to only include those with matching activities
  return issues.filter(issue => matchingIssueIds.includes(issue.id));
}

/**
 * Check if an issue matches the given action filters
 */
export async function checkIssueMatchesActionFilters(
  issueId: string,
  workspaceId: string,
  actionFilters: ActionFilter[]
): Promise<boolean> {
  if (!actionFilters.length) {
    return true;
  }

  const matchingIds = await getIssueIdsByActionFilters(workspaceId, actionFilters);
  return matchingIds.includes(issueId);
}
