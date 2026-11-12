const { assert, test, load } = require('./helpers.cjs');
const zod = require('zod');

const { commentHtml } = load('src/lib/comment-html.ts', { 'isomorphic-dompurify': { default: require('isomorphic-dompurify') }, marked: require('marked') });
const library = load('src/lib/issue-templates.ts', { '@/lib/comment-html': { commentHtml } });
const enforcement = load('src/lib/issue-template-enforcement.ts', { '@/lib/issue-templates': library });
const { STANDARD_TEMPLATES } = library;
const { createRefusal, updateRefusal, issueShape } = enforcement;
const plain = value => JSON.parse(JSON.stringify(value));

// A description with every required section of a type filled in, optionally with one section left out.
const complete = (type, without) => STANDARD_TEMPLATES[type].sections
  .filter(section => section.required && section.title !== without)
  .map(section => `## ${section.title}\n\nSomething real.`).join('\n\n');
const shape = (type, description, fields = {}) => ({ type, description, fields });

test('an issue with every required section and field is not refused', () => {
  assert.equal(createRefusal(STANDARD_TEMPLATES, shape('BUG', complete('BUG'), { priority: 'high' })), null);
  assert.equal(createRefusal(STANDARD_TEMPLATES, shape('task', complete('TASK'))), null);
});

test('a refusal names what is missing, says how to get the template, and carries it', () => {
  assert.deepEqual(plain(createRefusal(STANDARD_TEMPLATES, shape('BUG', complete('BUG', 'Environment')))), {
    error: 'template_required',
    error_description: 'Missing required sections: Environment. Missing required fields: priority. Write each section as a heading. Get the template with "collab templates get BUG".',
    issue_type: 'BUG', template_version: 1, missing_sections: ['Environment'], missing_fields: ['priority'],
    template: { sections: plain(STANDARD_TEMPLATES.BUG.sections), requiredFields: ['priority'] },
  });
});

test('a missing field on its own is named without the advice about headings', () => {
  const refusal = createRefusal(STANDARD_TEMPLATES, shape('BUG', complete('BUG')));
  assert.deepEqual(plain([refusal.missing_sections, refusal.missing_fields]), [[], ['priority']]);
  assert.equal(refusal.error_description, 'Missing required fields: priority. Get the template with "collab templates get BUG".');
});

test('labels written as bold text are not sections, and the refusal says to write headings', () => {
  const bold = STANDARD_TEMPLATES.TASK.sections.map(section => `**${section.title}**\n\nSomething real.`).join('\n\n');
  const refusal = createRefusal(STANDARD_TEMPLATES, shape('TASK', bold));
  assert.deepEqual(plain(refusal.missing_sections), ['What', 'Why', 'Done when']);
  assert.match(refusal.error_description, /Write each section as a heading\./);
});

test('subtasks and types without a template are never refused', () => {
  for (const type of ['SUBTASK', 'subtask', 'NOPE']) assert.equal(createRefusal(STANDARD_TEMPLATES, shape(type, null)), null);
});

test('an edit is refused only when it takes a complete issue to an incomplete one', () => {
  const task = shape('TASK', complete('TASK'));
  const sections = (before, after) => plain(updateRefusal(STANDARD_TEMPLATES, before, after)?.missing_sections ?? null);
  // An older issue that never had the sections can still be worked on.
  assert.equal(sections(shape('TASK', 'Old free text'), shape('TASK', 'Old free text, edited')), null);
  assert.equal(sections(shape('BUG', null), shape('BUG', null, { priority: 'urgent' })), null);
  assert.equal(sections(task, shape('TASK', `${complete('TASK')}\n\n## Notes\n\nMore.`)), null);
  assert.deepEqual(sections(task, shape('TASK', complete('TASK', 'Why'))), ['Why']);
  // A subtask is exempt, so making it a Task is a change that must end complete; the other way is free.
  assert.deepEqual(sections(shape('SUBTASK', 'Free text'), shape('TASK', 'Free text')), ['What', 'Why', 'Done when']);
  assert.equal(sections(shape('SUBTASK', 'Free text'), task), null);
  assert.equal(sections(task, shape('SUBTASK', null)), null);
  const milestone = shape('MILESTONE', complete('MILESTONE'), { dueDate: new Date('2026-12-01') });
  assert.deepEqual(plain(updateRefusal(STANDARD_TEMPLATES, milestone, { ...milestone, fields: { dueDate: null } }).missing_fields), ['dueDate']);
});

test('an issue row is read as its type, its description and the six template fields', () => {
  const row = { id: 'issue', title: 'Ignored', type: 'BUG', description: 'Text', priority: 'high', dueDate: null, labels: [{ id: 'label' }] };
  assert.deepEqual(plain(issueShape(row)), { type: 'BUG', description: 'Text', fields: { priority: 'high', dueDate: null, labels: [{ id: 'label' }] } });
  assert.equal(issueShape({ type: 'TASK', description: 42 }).description, null);
});

const PROJECT = 'c000000000000000000000003';
const agent = { workspace: { id: 'workspace', name: 'Workspace', slug: 'workspace' }, user: { id: 'agent' }, app: { id: 'app' }, installation: { id: 'installation' } };
const issueRow = (type, description, fields = {}) => ({
  id: 'issue', issueKey: 'P-1', workspaceId: 'workspace', projectId: PROJECT, title: 'Existing', status: 'todo',
  type, description, priority: 'medium', dueDate: null, startDate: null, assigneeId: null, storyPoints: null, labels: [], ...fields,
});

// One workspace with one stored issue, the real routes, and counters for what they write.
function workspace({ enforced = true, issue = null, templates = STANDARD_TEMPLATES } = {}) {
  const state = { issue, created: [], updated: [], beforeTransaction: null, transactionOptions: null };
  const db = {
    workspace: { findFirst: async () => ({ id: 'workspace', slug: 'workspace' }) },
    project: { findFirst: async () => ({ id: PROJECT, workspaceId: 'workspace' }) },
    projectStatus: { findFirst: async () => null },
    issue: {
      findFirst: async () => state.issue && { ...state.issue },
      findUniqueOrThrow: async () => ({ ...state.issue }),
      create: async ({ data }) => { state.created.push(data); return { id: 'created', issueKey: 'P-2', ...data }; },
      update: async ({ data }) => { state.updated.push(data); return { ...state.issue, ...data }; },
    },
    issueRelation: { create: async () => ({}) },
    issueActivity: { create: async () => ({}) },
    issueAssignee: { deleteMany: async () => ({}) },
    issueFollower: { findMany: async () => [] },
    projectFollower: { findMany: async () => [] },
    $transaction: async (operation, options) => {
      state.transactionOptions = options;
      if (state.beforeTransaction) state.beforeTransaction();
      return operation(db);
    },
  };
  const dependencies = {
    'next/server': { NextResponse: Response }, zod,
    '@/lib/prisma': { prisma: db },
    '@/lib/apps/auth-middleware': { withAppAuth: handler => handler },
    '@/lib/event-bus': { emitIssueCreated: async () => {}, emitIssueUpdated: async () => {} },
    '@/lib/forge/legacy-write-guard': { assertLegacyProjectWriteAllowed: async () => {}, assertLegacyIssueWriteAllowed: async () => {}, ForgeProjectWriteError: class extends Error {} },
    '@/lib/issue-key-allocation': { allocateIssueKey: async () => 'P-2' },
    '@/lib/agent-label-triggers': { enqueueLabelHandoff: async () => {}, InvalidIssueLabels: class extends Error {} },
    '@/lib/issue-templates': library,
    '@/lib/issue-template-enforcement': enforcement,
    '@/lib/issue-template-store': { getWorkspaceTemplates: async () => ({ enforced, templates }) },
    '@/lib/session': { getCurrentUser: async () => ({ id: 'person' }) },
    '@/lib/request-session': { getServerSession: async () => ({ user: { id: 'person', name: 'Person' } }) },
    '@/lib/auth-options': { authOptions: {} },
    '@/lib/permissions': { Permission: { CREATE_TASK: 'CREATE_TASK' }, checkUserPermission: async () => ({ hasPermission: true }) },
    '@/lib/issue-finder': { userHasWorkspaceAccess: async () => true, findIssueByIdOrKey: async () => state.issue && { ...state.issue } },
    '@/lib/issue-mutation': { updateIssue: async (_user, _id, fields) => { state.updated.push(fields); return { issue: { ...state.issue, ...fields } }; } },
    '@/lib/board-item-activity-service': { trackCreation: async () => {} },
    '@/lib/redis': { publishEvent: async () => {} },
    '@/utils/mentions': { extractMentionUserIds: () => [] },
    '@/lib/notification-service': { NotificationService: { notifyUsers: async () => {} }, NotificationType: {} },
    '@/utils/issueRelations': {},
  };
  const post = body => new Request('https://example.test/api', { method: 'POST', body: JSON.stringify(body) });
  const collection = load('src/app/api/apps/auth/issues/route.ts', dependencies, { console });
  const item = load('src/app/api/apps/auth/issues/[issueIdOrKey]/route.ts', dependencies, { console });
  const assignment = load('src/app/api/apps/auth/issues/[issueIdOrKey]/assign/route.ts', dependencies, { console });
  const assistant = load('src/app/api/ai/action/route.ts', dependencies, { console });
  const web = load('src/app/api/issues/route.ts', dependencies, { console });
  return {
    state,
    create: body => collection.POST(post({ title: 'New', projectId: PROJECT, ...body }), agent),
    patch: body => item.PATCH(new Request('https://example.test/api', { method: 'PATCH', body: JSON.stringify(body) }), agent, { params: Promise.resolve({ issueIdOrKey: 'P-1' }) }),
    unassign: () => assignment.POST(post({ unassign: true }), agent, { params: Promise.resolve({ issueIdOrKey: 'P-1' }) }),
    assistant: (type, params) => assistant.POST(post({ action: { type, params }, context: { workspace: { id: 'workspace' } } })),
    webCreate: body => web.POST(post({ title: 'New', projectId: PROJECT, workspaceId: 'workspace', ...body })),
  };
}

test('with enforcement off, an agent can create an issue with no description', async () => {
  const off = workspace({ enforced: false });
  assert.equal((await off.create({ type: 'BUG' })).status, 201);
  assert.equal(off.state.created.length, 1);
});

test('with enforcement on, an agent issue that lacks sections or fields is refused and nothing is written', async () => {
  const on = workspace({ issue: issueRow('EPIC', complete('EPIC')) });
  const response = await on.create({ type: 'BUG' });
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.error, 'template_required');
  assert.deepEqual([body.issue_type, body.template_version, body.missing_fields], ['BUG', 1, ['priority']]);
  assert.deepEqual(body.missing_sections, ['Summary', 'Steps to reproduce', 'Expected result', 'Actual result', 'Environment', 'Severity and impact']);
  assert.equal(body.template.sections.length, 8);
  assert.match(body.error_description, /^Missing required sections: Summary, .*collab templates get BUG"\.$/);
  // A task is the default type, and having a parent does not exempt it.
  assert.equal((await on.create({})).status, 422);
  assert.equal((await on.create({ type: 'TASK', parentId: 'c000000000000000000000009', description: 'Free text' })).status, 422);
  assert.deepEqual(on.state.created, []);
});

test('a complete agent issue is created, and a required field must be stated, not defaulted', async () => {
  const on = workspace();
  const defaulted = await on.create({ type: 'BUG', description: complete('BUG') });
  assert.equal(defaulted.status, 422);
  assert.deepEqual([(await defaulted.json()).missing_fields, on.state.created.length], [['priority'], 0]);
  assert.equal((await on.create({ type: 'BUG', description: complete('BUG'), priority: 'medium' })).status, 201);
  assert.equal((await on.create({ type: 'MILESTONE', description: complete('MILESTONE'), dueDate: '2026-12-01T00:00:00.000Z' })).status, 201);
  assert.equal((await on.create({ type: 'SUBTASK' })).status, 201);
  assert.deepEqual(on.state.created.map(data => data.type), ['BUG', 'MILESTONE', 'SUBTASK']);
});

test('an agent can still work on an older issue that never had the sections', async () => {
  const on = workspace({ issue: issueRow('TASK', 'Old free text') });
  for (const change of [{ status: 'done' }, { description: 'Old free text, edited' }, { type: 'BUG' }]) {
    assert.equal((await on.patch(change)).status, 200, JSON.stringify(change));
  }
  assert.equal(on.state.updated.length, 3);
});

test('an agent edit that would leave a complete issue incomplete is refused and nothing is written', async () => {
  const task = workspace({ issue: issueRow('TASK', complete('TASK')) });
  const response = await task.patch({ description: complete('TASK', 'Why') });
  assert.equal(response.status, 422);
  assert.deepEqual((await response.json()).missing_sections, ['Why']);
  assert.equal((await task.patch({ description: null })).status, 422);
  assert.equal((await task.patch({ type: 'BUG' })).status, 422);
  assert.deepEqual(task.state.updated, []);
  assert.equal((await task.patch({ description: `${complete('TASK')}\n\nMore.`, status: 'done' })).status, 200);
  assert.equal((await task.patch({ type: 'SUBTASK', description: null })).status, 200);

  const subtask = workspace({ issue: issueRow('SUBTASK', 'Free text') });
  assert.equal((await subtask.patch({ type: 'TASK' })).status, 422);
  assert.equal((await subtask.patch({ type: 'TASK', description: complete('TASK') })).status, 200);

  const milestone = workspace({ issue: issueRow('MILESTONE', complete('MILESTONE'), { dueDate: new Date('2026-12-01') }) });
  const cleared = await milestone.patch({ dueDate: null });
  assert.equal(cleared.status, 422);
  assert.deepEqual([(await cleared.json()).missing_fields, milestone.state.updated.length], [['dueDate'], 0]);
  assert.equal((await milestone.patch({ dueDate: '2027-01-15T00:00:00.000Z' })).status, 200);
});

test('unassigning cannot take away an assignee that the template requires', async () => {
  const templates = { ...STANDARD_TEMPLATES, TASK: { ...STANDARD_TEMPLATES.TASK, requiredFields: ['assigneeId'] } };
  const assigned = issueRow('TASK', complete('TASK'), { assigneeId: 'someone' });
  const on = workspace({ templates, issue: assigned });
  const response = await on.unassign();
  assert.equal(response.status, 422);
  assert.deepEqual([(await response.json()).missing_fields, on.state.updated], [['assigneeId'], []]);
  // Free where the template does not require an assignee, on an issue that was never complete, and with enforcement off.
  for (const free of [workspace({ issue: assigned }), workspace({ templates, issue: issueRow('TASK', 'Old free text', { assigneeId: 'someone' }) }), workspace({ templates, issue: assigned, enforced: false })]) {
    assert.equal((await free.unassign()).status, 200);
    assert.equal(free.state.updated.length, 1);
  }
});

test('unassignment checks the issue again inside a serializable transaction', async () => {
  const templates = { ...STANDARD_TEMPLATES, TASK: { ...STANDARD_TEMPLATES.TASK, requiredFields: ['assigneeId'] } };
  const on = workspace({ templates, issue: issueRow('TASK', 'Old free text', { assigneeId: 'someone' }) });
  on.state.beforeTransaction = () => { on.state.issue.description = complete('TASK'); };
  const response = await on.unassign();
  assert.equal(response.status, 422);
  assert.deepEqual((await response.json()).missing_fields, ['assigneeId']);
  assert.equal(on.state.transactionOptions.isolationLevel, 'Serializable');
  assert.deepEqual(on.state.updated, []);
});

test('assistant creation accepts and stores required template fields', async () => {
  const templates = { ...STANDARD_TEMPLATES, MILESTONE: { ...STANDARD_TEMPLATES.MILESTONE, requiredFields: ['dueDate', 'startDate', 'storyPoints', 'labels'] } };
  const on = workspace({ templates });
  const fields = { dueDate: '2026-12-01T00:00:00.000Z', startDate: '2026-11-01T00:00:00.000Z', storyPoints: 3, labels: ['label'] };
  const response = await on.assistant('create_issue', { title: 'New', type: 'MILESTONE', description: complete('MILESTONE'), ...fields });
  assert.equal(response.status, 200);
  const created = on.state.created[0];
  assert.equal(created.dueDate.toISOString(), fields.dueDate);
  assert.equal(created.startDate.toISOString(), fields.startDate);
  assert.equal(created.storyPoints, 3);
  assert.deepEqual(plain(created.labels), { connect: [{ id: 'label' }] });
  assert.equal((await on.assistant('create_issue', { title: 'New', type: 'MILESTONE', description: complete('MILESTONE'), ...fields, dueDate: 'invalid' })).status, 400);
});

test('with enforcement off, an agent edit is never refused', async () => {
  const off = workspace({ enforced: false, issue: issueRow('TASK', complete('TASK')) });
  assert.equal((await off.patch({ description: null })).status, 200);
});

test('the in-app assistant route follows the same create and update rules', async () => {
  const on = workspace({ issue: issueRow('TASK', complete('TASK')) });
  const refused = await on.assistant('create_issue', { title: 'New', type: 'BUG' });
  assert.equal(refused.status, 422);
  assert.deepEqual((await refused.json()).missing_fields, ['priority']);
  assert.equal((await on.assistant('update_issue', { issueId: 'issue', description: 'Free text' })).status, 422);
  assert.deepEqual([on.state.created, on.state.updated], [[], []]);
  assert.equal((await on.assistant('create_issue', { title: 'New', type: 'BUG', priority: 'high', description: complete('BUG') })).status, 200);
  assert.equal((await on.assistant('update_issue', { issueId: 'issue', title: 'Renamed' })).status, 200);
  assert.deepEqual(plain([on.state.created.length, on.state.updated]), [1, [{ title: 'Renamed' }]]);

  const older = workspace({ issue: issueRow('TASK', 'Old free text') });
  assert.equal((await older.assistant('update_issue', { issueId: 'issue', description: 'Edited' })).status, 200);
  const off = workspace({ enforced: false });
  assert.equal((await off.assistant('create_issue', { title: 'New', type: 'BUG' })).status, 200);
});

test('a person creating an issue in the web app is never refused', async () => {
  const on = workspace();
  const response = await on.webCreate({ type: 'BUG' });
  assert.equal(response.status, 201);
  assert.deepEqual(on.state.created.map(data => data.type), ['BUG']);
});
