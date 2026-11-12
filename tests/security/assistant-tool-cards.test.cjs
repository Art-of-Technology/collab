const { assert, test, readFileSync, resolve, runInNewContext, ts } = require('./helpers.cjs');

// Which card the chat shows for a tool result, and with what data. The component is run as a plain
// function: its imports become named markers, so the chosen card and its props can be inspected.
function renderer() {
  const markers = new Map();
  const imported = module => new Proxy({}, { get: (_, key) => {
    const id = `${module}:${String(key)}`;
    if (!markers.has(id)) markers.set(id, Object.defineProperty(function () {}, 'name', { value: String(key) }));
    return markers.get(id);
  } });
  const source = readFileSync(resolve(process.env.SECURITY_TEST_ROOT || resolve(__dirname, '../../'), 'src/components/ai/ToolResultRenderer.tsx'), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
  const exports = {};
  runInNewContext(outputText, { exports, require: name => name === 'react/jsx-runtime' ? require('react/jsx-runtime')
    : name === 'react' ? { ...require('react'), useMemo: run => run() } : imported(name) });
  return (toolName, value) => {
    const card = exports.default({ toolName, content: typeof value === 'string' ? value : JSON.stringify(value), isError: false }).props.children;
    return { kind: card.type.name, props: JSON.parse(JSON.stringify(card.props)) };
  };
}

const issue = { id: 'i1', issueKey: 'CLB-1', title: 'Fix login', status: 'in_progress', priority: 'high', type: 'BUG',
  project: { id: 'p1', name: 'Collab', issuePrefix: 'CLB' }, assignee: { id: 'u1', name: 'Alice', email: 'alice@example.test', image: null }, reporter: { id: 'u2', name: 'Claude' } };
const plain = { key: 'CLB-1', title: 'Fix login', status: 'in_progress', priority: 'high', type: 'BUG', assignee: 'Alice', project: 'Collab' };

test('an issue list from the workspace tools is shown as issue cards with plain text fields', () => {
  const card = renderer();
  const listed = card('issues_list', { issues: [issue, { issueKey: 'CLB-2', title: 'No owner yet', assignee: null, project: null }], pagination: { page: 1, total: 2 } });
  assert.equal(listed.kind, 'IssueList');
  // A person or project object would crash the card: only its name is passed on.
  assert.deepEqual(listed.props.issues, [plain, { key: 'CLB-2', title: 'No owner yet', status: '', priority: '', type: '', assignee: '', project: '' }]);
});

test('a single issue that was read, created or changed is shown as an issue card', () => {
  const card = renderer();
  for (const tool of ['issues_get', 'issues_create', 'issues_update']) {
    assert.deepEqual(card(tool, issue), { kind: 'IssueCard', props: { data: plain } }, tool);
  }
});

test('projects, labels and the account are shown as their cards', () => {
  const card = renderer();
  assert.deepEqual(card('projects_list', { projects: [{ id: 'p1', name: 'Collab' }] }), { kind: 'ProjectList', props: { projects: [{ id: 'p1', name: 'Collab' }] } });
  assert.deepEqual(card('labels_list', { labels: [{ id: 'l1', name: 'agent', color: '#fff' }] }), { kind: 'LabelList', props: { labels: [{ id: 'l1', name: 'agent', color: '#fff' }] } });
  assert.equal(card('whoami', { id: 'u1', name: 'Alice', email: 'alice@example.test' }).kind, 'MemberCard');
});

test('results from the earlier tool names keep their cards, and unknown tools fall back to the generic view', () => {
  const card = renderer();
  assert.equal(card('list_issues', [{ key: 'CLB-1', title: 'Fix login', assignee: 'Alice' }]).kind, 'IssueList');
  assert.deepEqual(card('get_issue', { key: 'CLB-1', title: 'Fix login', assignee: 'Alice', project: 'Collab' }).props.data.assignee, 'Alice');
  assert.equal(card('notes_list', { context: [] }).kind, 'GenericResult');
  assert.equal(card('comments_list', { comments: [] }).kind, 'GenericResult');
});
