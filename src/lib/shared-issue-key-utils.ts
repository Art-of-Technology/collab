/**
 * Shared utilities for issue keys that can be used on both client and server
 */

/**
 * Check if a string looks like an issue key (e.g., "UPG-123", "DNN1-T2", "SPA PR-1") vs a database ID
 * This function is used by API endpoints and should be permissive to handle existing issues
 */
export function isIssueKey(value: string): boolean {
  // Issue keys should match pattern: PREFIX-NUMBER or PREFIX-TYPE+NUMBER (e.g., UPG-123, PROJ-5, DNN1-T2, SPA PR-1)
  // Keep permissive for backward compatibility with existing issues
  const issueKeyPattern = /^[A-Z\s]+[0-9]*-[A-Z]*\d+$/;
  return issueKeyPattern.test(value);
}

/**
 * Strict validation for new issue prefixes during creation
 * No spaces allowed - letters and numbers only
 */
export function isValidNewIssuePrefix(prefix: string): boolean {
  // Only uppercase letters and numbers, no spaces
  return /^[A-Z][A-Z0-9]*$/.test(prefix.trim());
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