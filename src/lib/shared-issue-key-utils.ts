/**
 * Shared utilities for issue keys that can be used on both client and server
 */

/**
 * Check if a string looks like an issue key (e.g., "UPG-123") vs a database ID
 */
export function isIssueKey(value: string): boolean {
  // Issue keys should match pattern: PREFIX-NUMBER (e.g., UPG-123, PROJ-5)
  const issueKeyPattern = /^[A-Z]+-\d+$/;
  return issueKeyPattern.test(value);
}

/**
 * Detect entity type from URL parameter name
 */
export function getEntityTypeFromParam(paramName: string): 'task' | 'epic' | 'story' | 'milestone' | null {
  switch (paramName) {
    case 'taskId':
      return 'task';
    case 'epicId':
      return 'epic';
    case 'storyId':
      return 'story';
    case 'milestoneId':
      return 'milestone';
    default:
      return null;
  }
} 