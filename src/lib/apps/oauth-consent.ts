const descriptions: Record<string, string> = {
  'user:read': 'Read your Collab profile',
  'workspace:read': 'Read workspace information and reports',
  'workspace:write': 'Update workspace information and create labels',
  'projects:read': 'Read projects',
  'projects:write': 'Create and update projects',
  'issues:read': 'Read issues and work logs',
  'issues:write': 'Create, update and delete issues and work logs',
  'comments:read': 'Read issue comments',
  'comments:write': 'Add issue comments',
  'context:read': 'Read shared Notes and project context',
  'context:write': 'Create and update shared Notes',
  'prompts:read': 'Read AI context and knowledge',
  'knowledge:read': 'Read shared knowledge articles',
};

// Consent reflects the actual requested scopes, including read-only clients.
export function oauthConsentPermissions(scope: string): string[] {
  return [...new Set(scope.split(/\s+/).filter(Boolean))].map(value => descriptions[value] ?? `Requested permission: ${value}`);
}
