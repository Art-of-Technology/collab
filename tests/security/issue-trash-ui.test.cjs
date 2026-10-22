const { assert, test, load } = require('./helpers.cjs');

function fixture({ canPurge = false, failure = false, issueKey = 'CLB-123' } = {}) {
  const issue = { id: 'issue-1', issueKey, title: 'Keep my history', deletedAt: '2026-10-22T12:00:00Z', deletedById: 'alice' };
  const states = [], requests = [], invalidated = [], errors = [], successes = [], pending = [];
  let cursor = 0, tree, query;
  const jsx = (type, props) => ({ type, props });
  const data = { issues: [issue], canPurge };
  const deps = {
    react: { useState(value) { const index = cursor++; if (!(index in states)) states[index] = value; return [states[index], value => { states[index] = value; }]; } },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@tanstack/react-query': {
      useQueryClient: () => ({ invalidateQueries: async value => invalidated.push(value), removeQueries() {} }),
      useQuery: options => { query = options; return { data, isLoading: false, isFetching: false, isError: false, refetch() {} }; },
      useMutation: options => ({ isPending: false, mutate(variables) {
        pending.push(options.mutationFn(variables).then(result => options.onSuccess(result, variables)).catch(error => options.onError(error)));
      } }),
    },
    '@/components/ui/button': { Button: 'button' }, '@/components/ui/input': { Input: 'input' }, '@/components/ui/label': { Label: 'label' },
    '@/components/ui/alert-dialog': {
      AlertDialog: props => props.open ? jsx('dialog', props) : null,
      AlertDialogContent: 'div', AlertDialogDescription: 'p', AlertDialogFooter: 'footer',
      AlertDialogHeader: 'header', AlertDialogTitle: 'h2', AlertDialogCancel: 'button',
    },
    sonner: { toast: { error: message => errors.push(message), success: message => successes.push(message) } },
  };
  deps['@/hooks/queries/useIssues'] = load('src/hooks/queries/useIssues.ts', deps);
  const Component = load('src/components/issues/IssueTrash.tsx', deps, { URLSearchParams, fetch: async (url, init = {}) => {
    requests.push({ url, ...init });
    return { ok: !failure, json: async () => failure ? { error: 'Access denied' } : data };
  } }).IssueTrash;
  function render(node) {
    if (Array.isArray(node)) return node.map(render);
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') return render(node.type(node.props));
    return { ...node, props: { ...node.props, children: render(node.props?.children) } };
  }
  const rerender = () => { cursor = 0; tree = render(Component({ workspaceId: 'workspace-id', projectId: 'project-id' })); };
  const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : typeof node === 'string' ? node : '';
  const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
  rerender();
  return { requests, invalidated, errors, successes, issue, text: () => text(tree),
    buttons: label => nodes(tree).filter(node => node.type === 'button' && text(node) === label),
    async click(button) { assert.ok(button); assert.ok(!button.props.disabled, 'button must be enabled'); button.props.onClick(); await Promise.all(pending.splice(0)); rerender(); },
    type(value) { nodes(tree).find(node => node.type === 'input').props.onChange({ target: { value } }); rerender(); },
    read: () => query.queryFn({ signal: undefined }),
  };
}

test('project Trash reads exact scope and offers restore without purge to ordinary members', async () => {
  const f = fixture(); await f.read();
  assert.match(f.text(), /comments and history.*original key/);
  assert.equal(f.buttons('Delete permanently').length, 0);
  assert.equal(f.requests[0].url, '/api/issues/trash?workspaceId=workspace-id&projectId=project-id');
  await f.click(f.buttons('Restore')[0]);
  const request = f.requests[1];
  assert.equal(request.url, '/api/issues/issue-1/restore'); assert.equal(request.method, 'POST');
  assert.deepEqual(JSON.parse(request.body), { workspaceId: 'workspace-id', projectId: 'project-id' });
  assert.deepEqual(f.successes, ['CLB-123 restored with its original key.']);
  assert.ok(f.invalidated.some(value => JSON.stringify(value.queryKey) === '["issues","workspace","workspace-id"]'));
});

test('permanent deletion requires the exact issue key and uses scoped purge', async () => {
  const f = fixture({ canPurge: true });
  await f.click(f.buttons('Delete permanently')[0]);
  assert.equal(f.buttons('Delete permanently')[1].props.disabled, true);
  f.type('CLB-12'); assert.equal(f.buttons('Delete permanently')[1].props.disabled, true);
  assert.equal(f.requests.length, 0);
  f.type('CLB-123'); await f.click(f.buttons('Delete permanently')[1]);
  assert.equal(f.requests[0].url, '/api/issues/issue-1/purge'); assert.equal(f.requests[0].method, 'DELETE');
  assert.deepEqual(JSON.parse(f.requests[0].body), { workspaceId: 'workspace-id', projectId: 'project-id', confirmIssueKey: 'CLB-123' });
  assert.deepEqual(f.successes, ['CLB-123 permanently deleted.']);
});

test('failed restore reports the server error without claiming success or discarding history', async () => {
  const f = fixture({ failure: true });
  await f.click(f.buttons('Restore')[0]);
  assert.deepEqual(f.errors, ['Access denied']); assert.deepEqual(f.successes, []);
  assert.match(f.text(), /CLB-123.*Keep my history/);
  assert.equal(f.invalidated.length, 0);
});


test('legacy issues without an issue key use their ID for purge confirmation', async () => {
  const f = fixture({ canPurge: true, issueKey: null });
  await f.click(f.buttons('Delete permanently')[0]);
  f.type('issue-1'); await f.click(f.buttons('Delete permanently')[1]);
  assert.equal(JSON.parse(f.requests[0].body).confirmIssueKey, 'issue-1');
  assert.deepEqual(f.successes, ['issue-1 permanently deleted.']);
});
