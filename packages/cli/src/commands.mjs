// Fixed API routes only. No arbitrary authenticated URL or secret-reveal command.
const command = (method, path, fields = {}, query = {}, extra = {}) => ({ method, path, fields, query, ...extra });
const string = 'string', integer = 'integer', boolean = 'boolean', array = 'array';
const projectQuery = { projectId: string };
const page = { page: integer, limit: integer };
const offset = { offset: integer, limit: integer };
const issueFields = { title: string, description: string, type: string, priority: string, status: string, assigneeId: string, parentId: string, milestoneId: string, dueDate: string, startDate: string, storyPoints: integer, color: string, labels: array };
const noteFields = { title: string, content: string, type: string, scope: string, projectId: string, isAiContext: boolean, aiContextPriority: integer, tagIds: array };
const timeFields = { timeSpent: integer, description: string, loggedAt: string };
const retrievalBounds = { limit: { minimum: 1, maximum: 50 }, offset: { minimum: 0, maximum: 50000 }, maxTokens: { minimum: 1024, maximum: 64000 } };
const retrievalIdentifier = { trim: true, minLength: 1, maxLength: 128 };

export const commands = {
  'agents list': command('GET', 'agents'),
  'agents register': command('POST', 'agents', { name: string, labelIds: array, host: string, sessionId: string }, {}, { required: ['name'], description: 'Bind a stable agent name to a host and session with --host and --session-id together. Reuse this name after restart.' }),
  'agents retire': command('DELETE', 'agents', {}, { agent: string }, {
    requiredQuery: ['agent'], deletePreview: true,
    description: 'Remove an agent registration that is no longer used, after reading what it holds. Its claimed work goes back to open with an entry on each issue; handoffs addressed only to it stay open and are listed. Requires --yes; --dry-run reads only the preview without --yes.',
  }),
  'inbox list': command('GET', 'agents/inbox', {}, { agent: string, state: string, limit: integer, cursor: string }, { requiredQuery: ['agent'], constraints: { state: { enum: ['unseen', 'claimed'] }, limit: { minimum: 1, maximum: 50 }, cursor: { minLength: 1, maxLength: 4096 } } }),
  'inbox watch': command('GET', 'agents/inbox', {}, { agent: string }, {
    requiredQuery: ['agent'], watch: true,
    localOptions: { callback: string, callbackArgs: array, watchSeconds: integer, pollSeconds: integer, callbackTimeout: integer, host: string, sessionId: string },
    requiredOptions: ['callback'],
    description: 'Foreground bounded watcher; invokes a trusted local executable with JSON stdin for pending claimed/unseen work. Requires an explicit --workspace ID. Supply the registered --host and --session-id to publish watcher health. No auto-claim or seen.',
  }),
  'inbox wait': command('GET', 'agents/inbox', {}, { agent: string, limit: integer }, { requiredQuery: ['agent'], wait: true, constraints: { limit: { minimum: 1, maximum: 50 } } }),
  'handoffs send': command('POST', 'agents/handoffs', { agent: string, issue: string, content: string, toAgents: array, toLabels: array, requestAck: boolean, requestId: string, afterId: string }, {}, { required: ['agent', 'issue', 'content'], description: 'Send from --agent to at least one registered recipient in --to-agents or role label in --to-labels (JSON arrays). Optional --request-id must be a UUID; reuse it for retries.' }),
  'handoffs get': command('GET', 'agents/handoffs/:id', {}, { agent: string }, { requiredQuery: ['agent'] }),
  'transfers offer': command('POST', 'agents/transfer-offers', { agent: string, handoffId: string, toAgent: string, requestId: string, content: string }, {}, { required: ['agent', 'handoffId', 'toAgent', 'requestId', 'content'], description: '--request-id must be a UUID; reuse it for retries.' }),
  'transfers list': command('GET', 'agents/transfer-offers', {}, { agent: string, status: string, limit: integer, cursor: string }, { requiredQuery: ['agent'], constraints: { limit: { minimum: 1, maximum: 50 }, cursor: { minLength: 1, maxLength: 4096 } } }),
  ...Object.fromEntries(['accept', 'cancel'].map(action => [
    `transfers ${action}`, command('PATCH', 'agents/transfer-offers/:id', { agent: string }, {}, { action, required: ['agent'] }),
  ])),
  'reviews request': command('POST', 'agents/reviews', { agent: string, handoffId: string, reviewerAgentId: string, requestId: string,
    repository: string, pullRequestNumber: integer, revision: string, content: string }, {}, {
    required: ['agent', 'handoffId', 'reviewerAgentId', 'requestId', 'repository', 'pullRequestNumber', 'revision', 'content'],
    description: 'Request review without releasing your handoff. Use the reviewer registration ID from agents list and reuse the UUID request ID for retries.',
  }),
  'reviews list': command('GET', 'agents/reviews', {}, { agent: string, limit: integer, cursor: string }, {
    requiredQuery: ['agent'], constraints: { agent: { pattern: '^[a-z0-9][a-z0-9_-]{0,63}$' }, limit: { minimum: 1, maximum: 50 }, cursor: { minLength: 1, maxLength: 4096, pattern: '^[A-Za-z0-9_-]+$' } },
    description: 'List reviews for this agent; pass the returned nextCursor as --cursor to read the next page.',
  }),
  'reviews wait': command('GET', 'agents/reviews', {}, { agent: string, cursor: string }, {
    requiredQuery: ['agent'], wait: true, localOptions: { reviewerId: string }, requiredOptions: ['reviewerId'],
    constraints: { agent: { pattern: '^[a-z0-9][a-z0-9_-]{0,63}$' }, cursor: { minLength: 1, maxLength: 4096, pattern: '^[A-Za-z0-9_-]+$' } },
    description: 'Poll read-only for pending or claimed reviews addressed to --reviewer-id. Follow nextCursor with --cursor to see all pages; null ends the cycle. Never claims or wakes.',
  }),
  'reviews get': command('GET', 'agents/reviews/:id', {}, { agent: string }, { requiredQuery: ['agent'], constraints: { agent: { pattern: '^[a-z0-9][a-z0-9_-]{0,63}$' } } }),
  'reviews claim': command('PATCH', 'agents/reviews/:id', { agent: string }, {}, { action: 'claim', required: ['agent'] }),
  'reviews reply': command('PATCH', 'agents/reviews/:id', { agent: string, verdict: string, reviewedRevision: string, content: string }, {}, {
    action: 'reply', required: ['agent', 'verdict', 'reviewedRevision', 'content'],
    description: 'Reply as the claimed reviewer with approved, changes_requested or blocked and the exact requested revision.',
  }),
  'reviews hold': command('PATCH', 'agents/reviews/:id', { agent: string, reason: string, expectedHoldVersion: integer }, {}, {
    action: 'hold', required: ['agent', 'reason', 'expectedHoldVersion'], description: 'Use the holdVersion last read from this review; read it again after an uncertain result.',
  }),
  'reviews release-hold': command('PATCH', 'agents/reviews/:id', { agent: string, expectedHoldVersion: integer }, {}, {
    action: 'release_hold', required: ['agent', 'expectedHoldVersion'], description: 'Clear a hold only using the version last read. A stale version never clears a newer hold.',
  }),
  'reviews cancel': command('PATCH', 'agents/reviews/:id', { agent: string, reason: string }, {}, {
    action: 'cancel', required: ['agent', 'reason'], description: 'Cancel a review after clearing any hold; the original handoff remains claimed.',
  }),
  'reviews resolve': command('PATCH', 'agents/reviews/:id', { agent: string }, {}, {
    action: 'resolve', required: ['agent'], description: 'Acknowledge an approved review receipt. Independently verify the current PR, required reviews, checks and holds before merging.',
  }),
  ...Object.fromEntries(['seen', 'ack', 'claim', 'progress', 'release', 'complete'].map(action => [
    `handoffs ${action}`, command('PATCH', 'agents/handoffs/:id', { agent: string, content: string }, {}, { action, required: ['agent', ...(['progress', 'release', 'complete'].includes(action) ? ['content'] : [])] }),
  ])),
  'handoffs supersede': command('PATCH', 'agents/handoffs/:id', { agent: string, content: string, replacementId: string }, {}, {
    action: 'supersede', required: ['agent', 'content', 'replacementId'], description: 'Close obsolete work and link its existing replacement on the same issue. Only the sender of open work or the current claimant may do this.',
  }),
  'seat show': command('GET', 'seats/me', {}, {}, { description: 'The seat behind this token: its project and role. Refused with seat_required for a token that is not a seat.' }),
  'seat inbox': command('GET', 'seats/me/inbox', {}, {}, {
    wait: 'optional',
    description: 'What to work on next, in order, each with its reason. With --wait-seconds 1..60 it polls until there is work, so a plain script can wait without a model. Reads only.',
  }),
  'seat request': command('POST', 'seats/me/requests', { project: string, role: string, title: string, body: string, fromIssue: string, blocks: boolean }, {}, {
    required: ['role', 'title', 'body', 'fromIssue'],
    description: 'Ask a seat for work on one of your issues: --role developer, review, release or security, --from-issue the issue it is for, --body or --body-file filled in from the Task template. --project names another project by ID or issue prefix; without it the request stays in your project. --blocks true makes your issue wait for it; a security request always does.',
  }),
  'seat setup': command('POST', 'seats/setup/:project', { carryOver: array }, {}, {
    setupPreview: true,
    description: 'collab seat setup PROJECT [--yes]. Gives an existing project the four seats a run needs (developer, reviewer, release, security), each run by your runner, and switches the project to seats. PROJECT is its ID or issue prefix. Without --yes, and with --dry-run, it only prints the preview: which seats are missing and the names they would get ("<Project> <Role>"), the claims of the last seven days that would go to the developer seat, and what stops it. A seat of a role that exists is left alone, whoever made it. --carry-over takes a JSON array of issue keys to carry over instead of all of them. No token is printed: the runner fetches them on its next ask. A person only.',
  }),
  'seat run': command('GET', 'seats/me/inbox', {}, {}, {
    seatRun: true, localOptions: { once: boolean },
    description: 'collab seat run [--once] -- PROGRAM [ARGS...]. Waits for the next issue in the inbox, checks it out and starts PROGRAM with ARGS as given, no shell, with COLLAB_RUN_ID, COLLAB_RUN_GENERATION and COLLAB_ISSUE_KEY in its environment. Renews the lease while PROGRAM lives; when it exits without having finished the run, closes it. One issue at a time; --once stops after one.',
  }),
  'run start': command('POST', 'runs', { issue: string, generation: string, runner: string }, {}, {
    required: ['issue'], description: 'Take an issue assigned to you. One run is open per issue. The reply carries the generation that renew and finish need.',
  }),
  'run context': command('GET', 'issues/:id/run-context', {}, {}, { description: 'What a fresh session needs to work an issue, in one read: the issue, the last exit note and its checked facts (pull request, head commit, next step), comments since, blockers and requests.' }),
  'run renew': command('PATCH', 'runs/:id', { generation: string }, {}, { event: 'renew', required: ['generation'], description: "Extend a seat's 60 second lease. collab seat run does this for the program it starts." }),
  'run finish': command('PATCH', 'runs/:id', { generation: string, outcome: string, note: string, status: string, reviewRequest: string, askedUser: string, blockedBy: string, alsoFinish: array, verdict: string, reviewed: string, pullRequest: string, headCommit: string, nextStep: string }, {}, {
    event: 'finish', required: ['generation', 'outcome', 'note'],
    description: 'End a run with --outcome done, in_review or blocked and an exit note (--note or --note-file) with the headings ## Done, ## Decisions, ## Evidence and ## Next. in_review names --review-request or --asked-user; blocked names --blocked-by or --asked-user. --status picks the project status when the outcome has several. A security request finishes done with --verdict passed or failed and --reviewed, the commit or pull request that was read. The facts the next session reads as fields: --next-step, the first thing to do next in one line (in_review and blocked need one), and --pull-request OWNER/REPO#NUMBER with --head-commit, the full 40-character commit it was left at.',
  }),
  'search': command('GET', 'search', {}, { query: string, mode: string, ...projectQuery, type: string, status: string,
    assigneeId: string, after: string, before: string, ...offset, maxTokens: integer }, {
    requiredQuery: ['query'], defaults: { mode: 'hybrid', limit: 20, offset: 0, maxTokens: 8000 },
    defaultDescriptions: { type: 'all (server default)' },
    description: 'status and assigneeId filter issues and their activity; neither can be used with type=note. after must not follow before.',
    constraints: { ...retrievalBounds, query: { trim: true, minLength: 1, maxLength: 500 },
      projectId: retrievalIdentifier, status: retrievalIdentifier, assigneeId: retrievalIdentifier,
      mode: { enum: ['exact', 'keyword', 'semantic', 'hybrid', 'fuzzy'] }, type: { enum: ['all', 'issue', 'note', 'activity'] },
      after: { format: 'date-time' }, before: { format: 'date-time' } },
  }),
  'live': command('GET', 'live', {}, { commit: string }, {
    wait: 'optional', waitMax: 3600, pollMs: 5000, ready: result => [true, false, null].includes(result?.contains) ? result.contains : undefined, constraints: { commit: { pattern: '^[0-9a-f]{7,40}$' } },
    description: 'The commit of Collab that the server runs. With --commit ID also contains: true, false, or null when it cannot be told. With --wait-seconds 1..3600 it asks every 5 seconds until the server runs that commit, through the restart of a deploy, or returns timedOut: true. Reads only.',
  }),
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
  'issues list': command('GET', 'issues', {}, { ...page, ...projectQuery, assigneeId: string, milestoneId: string, status: string, type: string, priority: string, search: string }, { pagination: ['issues', 'page'] }),
  'issues get': command('GET', 'issues/:id'),
  'issues create': command('POST', 'issues', { ...issueFields, projectId: string }, {}, { required: ['title', 'projectId'], defaultProject: true }),
  'issues update': command('PATCH', 'issues/:id', { ...issueFields, progress: integer, timeEstimateMinutes: integer }, {}, { description: 'Set --milestone-id to a Milestone issue ID in the same project. To clear it, use --input with a JSON body containing "milestoneId": null.' }),
  'issues delete': command('DELETE', 'issues/:id', {}, projectQuery, {
    requiredQuery: ['projectId'], deletePreview: true,
    description: 'Move one issue to trash after reading its identity and affected counts. Requires project context and --yes; --dry-run reads only the preview without --yes.',
  }),
  'issues trash': command('GET', 'issues/trash', {}, projectQuery, { requiredQuery: ['projectId'] }),
  'issues restore': command('POST', 'issues/:id/restore', {}, projectQuery, { requiredQuery: ['projectId'] }),
  'issues assign': command('POST', 'issues/:id/assign', { assigneeId: string, role: string, unassign: boolean }),
  'issues activity': command('GET', 'issues/:id/activity', {}, { limit: integer, action: string }),
  'issues attach': command('POST', 'issues/:id/attachments', { name: string, contentBase64: string }, {}, {
    required: ['name', 'contentBase64'], localOptions: { file: string },
    description: 'Attach a file to an issue: --file PATH reads it (at most 5 MiB; --name when it is read from stdin with --file -). The file is kept in the Issue attachments folder of the issue\'s project. The reply has its "markdown": put that line in a comment or in the description and the image shows there, or the file is offered as a download.',
  }),
  'comments list': command('GET', 'issues/:id/comments', {}, { flat: boolean }),
  'comments add': command('POST', 'issues/:id/comments', { content: string, parentId: string }, {}, { required: ['content'] }),
  'comments wait': command('GET', 'issues/:id/comments', {}, { since: string }, {
    wait: true, waitMax: 3600, pollMs: 5000, ready: result => Array.isArray(result?.comments) ? result.comments.length > 0 : undefined, defaults: { flat: true }, constraints: { since: { format: 'date-time' } },
    description: 'Wait for a new comment on an issue without a model: asks every 5 seconds for up to --wait-seconds 1..3600 (default 30) and returns the new comments, or timedOut: true. --since is the createdAt of the last comment you have read; without it, comments made after the command starts. Keeps waiting while the server restarts. Reads only.',
  }),
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
  'templates list': command('GET', 'issue-templates', {}, {}, {
    description: 'The issue template for each type in the workspace: required sections, required fields and a Markdown body to fill in.',
  }),
  'templates get': command('GET', 'issue-templates/:id', {}, {}, {
    description: 'One issue template by type: BUG, STORY, EPIC, MILESTONE or TASK. Subtasks have none.',
  }),
  'views list': command('GET', 'views'),
  'views get': command('GET', 'views/:id'),
  'members search': command('GET', 'search/users', {}, { q: string, role: string, team: string, hasActiveIssues: boolean, limit: integer }),
  'notes list': command('GET', 'context', {}, { ...offset, ...projectQuery, type: string, scope: string, search: string, aiContext: boolean }, { pagination: ['context', 'offset'] }),
  'notes get': command('GET', 'context/:id'),
  'notes create': command('POST', 'context', noteFields, {}, { required: ['title', 'content'], defaultProject: true }),
  'notes update': command('PUT', 'context/:id', noteFields),
  'notes delete': command('DELETE', 'context/:id', {}, {}, {
    deletePreview: true,
    description: 'Permanently delete one Note you authored, after reading its identity. Notes have no trash. Requires --yes; --dry-run reads only the preview without --yes.',
  }),
  'folders list': command('GET', 'context/folders', {}, { ...projectQuery, offset: integer }, { description: 'List workspace folders and optionally project folders, up to 500; Follow nextOffset with --offset to read more folders.' }),
  'folders get': command('GET', 'context/folders/:id', {}, { offset: integer }, { description: 'Read a folder and up to 200 child folders, shared Notes and files per type; Follow nextOffset with --offset to read more items. Personal, encrypted and secret Notes are excluded.' }),
  'files get': command('GET', 'context/files/:id', {}, {}, { description: 'Read metadata and up to 256 KiB of text/CSV or embedded PDF text (8 MiB input, first 100 pages, 256 KiB output). Other types and unreadable PDFs return metadata and a reason; no OCR.' }),
  'context get': command('GET', 'ai-context', {}, { ...projectQuery, includeKnowledge: boolean, includePipeline: boolean,
    ...offset, maxTokens: integer, since: string }, {
    defaults: { maxTokens: 8000 },
    defaultDescriptions: {
      includePipeline: 'true with projectId unless includeKnowledge=true; false otherwise (CLI default)',
      limit: '10 (server default; includePipeline=true only)',
      offset: '0 (server default; includePipeline=true only)',
      since: '7 days before the server request time (server default; includePipeline=true only)',
    },
    constraints: { ...retrievalBounds, projectId: retrievalIdentifier, maxTokens: { minimum: 2048, maximum: 64000 }, since: { format: 'date-time' } },
    description: 'With a project, return pipeline context including workspace and project folders. includePipeline=false or includeKnowledge=true selects the legacy prompt format.',
  }),
  'knowledge list': command('GET', 'context/knowledge', {}, { ...offset, ...projectQuery, q: string, type: string }),
  'knowledge get': command('GET', 'context/knowledge/:id'),
  'reports issues': command('GET', 'reports/issue-summary', {}, { ...projectQuery, period: integer, comparePeriod: boolean }),
  'reports workload': command('GET', 'reports/assignee-workload', {}, { ...projectQuery, period: integer, includeCompleted: boolean }),
  'reports timeline': command('GET', 'reports/timeline', {}, { ...projectQuery, daysAhead: integer, assigneeId: string, includeCompleted: boolean }),
  'reports time': command('GET', 'reports/time-tracking', {}, { ...projectQuery, period: string, startDate: string, endDate: string, userId: string, groupBy: string, includeDetails: boolean }),
};

export const scopes = ['user:read', 'workspace:read', 'workspace:write', 'projects:read', 'projects:write', 'issues:read', 'issues:write', 'context:read', 'context:write', 'prompts:read', 'knowledge:read'];
export const flagName = key => key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
