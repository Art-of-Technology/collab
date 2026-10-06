// Fixed API routes only. No arbitrary authenticated URL or secret-reveal command.
const command = (method, path, fields = {}, query = {}, extra = {}) => ({ method, path, fields, query, ...extra });
const string = 'string', integer = 'integer', boolean = 'boolean', array = 'array';
const projectQuery = { projectId: string };
const page = { page: integer, limit: integer };
const offset = { offset: integer, limit: integer };
const issueFields = { title: string, description: string, type: string, priority: string, status: string, assigneeId: string, parentId: string, dueDate: string, startDate: string, storyPoints: integer, color: string, labels: array };
const noteFields = { title: string, content: string, type: string, scope: string, projectId: string, isAiContext: boolean, aiContextPriority: integer, tagIds: array };
const timeFields = { timeSpent: integer, description: string, loggedAt: string };

export const commands = {
  'whoami': command('GET', 'user/me'),
  'workspaces list': command('GET', 'user/workspaces'),
  'workspace get': command('GET', 'workspace'),
  'workspace members': command('GET', 'workspace/members', {}, { ...page, role: string, status: string, search: string }),
  'workspace stats': command('GET', 'workspace/stats'),
  'workspace activity': command('GET', 'workspace/activity', {}, { ...page, ...projectQuery, action: string, userId: string }),
  'projects list': command('GET', 'projects', {}, { search: string, includeArchived: boolean }),
  'projects get': command('GET', 'projects/:id'),
  'projects create': command('POST', 'projects', { name: string, slug: string, issuePrefix: string, description: string, color: string }, {}, { required: ['name', 'slug', 'issuePrefix'] }),
  'projects update': command('PATCH', 'projects/:id', { name: string, description: string, color: string, isArchived: boolean }),
  'projects statuses': command('GET', 'projects/:id/statuses'),
  'projects stats': command('GET', 'projects/:id/stats'),
  'projects activity': command('GET', 'projects/:id/activity', {}, { limit: integer, action: string }),
  'issues list': command('GET', 'issues', {}, { ...page, ...projectQuery, assigneeId: string, status: string, type: string, priority: string, search: string }, { pagination: ['issues', 'page'] }),
  'issues get': command('GET', 'issues/:id'),
  'issues create': command('POST', 'issues', { ...issueFields, projectId: string }, {}, { required: ['title', 'projectId'], defaultProject: true }),
  'issues update': command('PATCH', 'issues/:id', { ...issueFields, progress: integer, timeEstimateMinutes: integer }),
  'issues delete': command('DELETE', 'issues/:id'),
  'issues assign': command('POST', 'issues/:id/assign', { assigneeId: string, role: string, unassign: boolean }),
  'issues activity': command('GET', 'issues/:id/activity', {}, { limit: integer, action: string }),
  'comments list': command('GET', 'issues/:id/comments', {}, { flat: boolean }),
  'comments add': command('POST', 'issues/:id/comments', { content: string, parentId: string }, {}, { required: ['content'] }),
  'relations list': command('GET', 'issues/:id/relations'),
  'relations add': command('POST', 'issues/:id/relations', { targetIssueId: string, relationType: string }, {}, { required: ['targetIssueId', 'relationType'] }),
  'relations delete': command('DELETE', 'issues/:id/relations/:childId'),
  'worklogs list': command('GET', 'issues/:id/work-logs', {}, { ...offset, userId: string }, { pagination: ['workLogs', 'offset'] }),
  'worklogs get': command('GET', 'issues/:id/work-logs/:childId'),
  'worklogs add': command('POST', 'issues/:id/work-logs', timeFields, {}, { required: ['timeSpent'] }),
  'worklogs update': command('PATCH', 'issues/:id/work-logs/:childId', timeFields),
  'worklogs delete': command('DELETE', 'issues/:id/work-logs/:childId'),
  'labels list': command('GET', 'labels', {}, { search: string }),
  'labels create': command('POST', 'labels', { name: string, color: string }, {}, { required: ['name'] }),
  'views list': command('GET', 'views'),
  'views get': command('GET', 'views/:id'),
  'members search': command('GET', 'search/users', {}, { q: string, role: string, team: string, hasActiveIssues: boolean, limit: integer }),
  'notes list': command('GET', 'context', {}, { ...offset, ...projectQuery, type: string, scope: string, search: string, aiContext: boolean }, { pagination: ['context', 'offset'] }),
  'notes get': command('GET', 'context/:id'),
  'notes create': command('POST', 'context', noteFields, {}, { required: ['title', 'content'], defaultProject: true }),
  'notes update': command('PUT', 'context/:id', noteFields),
  'context get': command('GET', 'ai-context', {}, { ...projectQuery, includeKnowledge: boolean }),
  'knowledge list': command('GET', 'context/knowledge', {}, { ...offset, ...projectQuery, q: string, type: string }),
  'knowledge get': command('GET', 'context/knowledge/:id'),
  'reports issues': command('GET', 'reports/issue-summary', {}, { ...projectQuery, period: integer, comparePeriod: boolean }),
  'reports workload': command('GET', 'reports/assignee-workload', {}, { ...projectQuery, period: integer, includeCompleted: boolean }),
  'reports timeline': command('GET', 'reports/timeline', {}, { ...projectQuery, daysAhead: integer, assigneeId: string, includeCompleted: boolean }),
  'reports time': command('GET', 'reports/time-tracking', {}, { ...projectQuery, period: string, startDate: string, endDate: string, userId: string, groupBy: string, includeDetails: boolean }),
};

export const scopes = ['user:read', 'workspace:read', 'workspace:write', 'projects:read', 'projects:write', 'issues:read', 'issues:write', 'comments:read', 'comments:write', 'context:read', 'context:write', 'prompts:read', 'knowledge:read'];
export const flagName = key => key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
