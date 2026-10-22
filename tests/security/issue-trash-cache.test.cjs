const { assert, test, load } = require('./helpers.cjs');
const { QueryClient } = require('@tanstack/react-query');

function fixture() {
  const client = new QueryClient();
  const requests = [];
  const hooks = load('src/hooks/queries/useIssues.ts', {
    '@tanstack/react-query': { useQueryClient: () => client, useMutation: options => options },
  }, { URLSearchParams, fetch: async (url, init) => { requests.push({ url, ...init }); return { ok: true }; } });
  return { client, hooks, requests };
}

test('Trash changes invalidate the affected lists and counts without flushing other workspaces', async () => {
  const { client, hooks } = fixture();
  const affected = [
    ['issues', 'workspace', 'workspace', 'project'], ['issues', 'project', 'project'],
    ['additional-issues', 'workspace', 'project'], ['issueTrash', 'workspace', 'project'],
    ['projectSummary', 'project'], ['projects', { workspaceId: 'workspace', includeStats: true }],
    ['views', { workspaceId: 'workspace', includeStats: true }], ['assignedIssues', 'user', 'workspace'],
    ['project', 'workspace-slug', 'project-slug'],
  ];
  const unrelated = [
    ['issues', 'workspace', 'other'], ['issues', 'project', 'other'], ['additional-issues', 'other'],
    ['issueTrash', 'other', 'other'], ['projectSummary', 'other'],
    ['projects', { workspaceId: 'other', includeStats: true }], ['views', { workspaceId: 'other' }],
    ['assignedIssues', 'user', 'other'], ['project', 'other', 'other'],
  ];
  for (const key of affected) client.setQueryData(key, { id: 'project' });
  for (const key of unrelated) client.setQueryData(key, { id: 'other' });
  await hooks.invalidateIssueTrashQueries(client, 'workspace', 'project');
  for (const key of affected) assert.equal(client.getQueryState(key).isInvalidated, true, JSON.stringify(key));
  for (const key of unrelated) assert.equal(client.getQueryState(key).isInvalidated, false, JSON.stringify(key));
  client.clear();
});

test('moving to Trash uses canonical ID and exact scope and removes both cached detail aliases', async () => {
  const { client, hooks, requests } = fixture();
  const input = { id: 'issue-id', issueKey: 'CLB-123', workspaceId: 'workspace', projectId: 'project' };
  client.setQueryData(['issues', 'detail', input.id, 'workspace'], { issue: input });
  client.setQueryData(['issues', 'detail', input.issueKey, 'workspace'], { issue: input });
  client.setQueryData(['issueTrash', 'workspace', 'project'], { issues: [] });
  const mutation = hooks.useDeleteIssue();
  await mutation.mutationFn(input); await mutation.onSuccess(undefined, input);
  assert.equal(requests[0].url, '/api/issues/issue-id?workspaceId=workspace&projectId=project');
  assert.equal(requests[0].method, 'DELETE');
  assert.equal(client.getQueryData(['issues', 'detail', input.id, 'workspace']), undefined);
  assert.equal(client.getQueryData(['issues', 'detail', input.issueKey, 'workspace']), undefined);
  assert.equal(client.getQueryState(['issueTrash', 'workspace', 'project']).isInvalidated, true);
  client.clear();
});
