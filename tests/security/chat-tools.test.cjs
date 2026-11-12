const { assert, test, load } = require('./helpers.cjs');

const SCOPES = ['issues:read', 'issues:write'];
const URL_ = 'https://collab.example.test/api/ai/chat/stream';

// The in-app assistant offers the MCP tools to the model and runs them in-process as the signed-in member.
function fixture({ handshake = [true], tool = { content: [{ type: 'text', text: '{"issues":[{"issueKey":"CLB-1"}]}' }] } } = {}) {
  const runs = [], provider = [], invalidated = [], issued = [];
  const agent = { slug: 'cleo', name: 'Cleo', color: '#fff', systemPrompt: 'Test' };
  const sse = events => new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''));
  const answers = [
    // The model first calls a workspace tool...
    [{ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'issues_list' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"limit":5}' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' } }],
    // ...then answers in text.
    [{ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Done' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } }],
  ];
  const { POST } = load('src/app/api/ai/chat/stream/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/coclaw-retired': { coclawRetired: () => new Response('', { status: 410 }) },
    '@/lib/session': { getCurrentUser: async () => ({ id: 'alice', name: 'Alice' }) },
    '@/lib/post-access': load('src/lib/post-access.ts'),
    '@/lib/prisma': { prisma: {
      workspace: { findFirst: async () => ({ id: 'w1', name: 'One', slug: 'one' }) },
      aIConversation: { findFirst: async () => null, create: async () => ({ id: 'conversation' }) },
      aIAgent: { findUnique: async () => ({ id: 'cleo' }) },
      aIMessage: { create: async () => {} },
    } },
    '@/lib/ai/agents/registry': { getAgent: async () => agent, getDefaultAgent: async () => agent },
    '@/lib/ai/mcp-token': {
      getMcpToken: async (_prisma, userId, workspaceId) => { issued.push([userId, workspaceId]); return `token-${issued.length}`; },
      invalidateMcpToken: async (_prisma, userId, workspaceId) => { invalidated.push([userId, workspaceId]); },
    },
    '@/lib/mcp-oauth': { MCP_SCOPES: SCOPES },
    '@/lib/mcp-tools': {
      toolsFor: () => [
        { name: 'whoami', description: 'The account', schema: { type: 'object' } },
        { name: 'issues_list', description: 'List issues', schema: { type: 'object', properties: { limit: { type: 'integer' } } } },
      ],
      runTool: async (name, args, authorization, base, scopes) => {
        runs.push({ name, args: { ...args }, authorization, base, scopes: [...scopes] });
        if (name !== 'whoami') return tool;
        return (handshake.length > 1 ? handshake.shift() : handshake[0])
          ? { content: [{ type: 'text', text: '{"id":"alice"}' }] }
          : { content: [{ type: 'text', text: '{"error":"invalid_token"}' }], isError: true };
      },
    },
  }, {
    process: { env: {} }, Response, ReadableStream, TextEncoder, TextDecoder, AbortController, setTimeout, clearTimeout,
    console: { log() {}, error() {}, warn() {} },
    fetch: async (_url, init) => { provider.push(JSON.parse(init.body)); return sse(answers[Math.min(provider.length, answers.length) - 1]); },
  });
  const chat = async () => {
    const response = await POST(new Request(URL_, { method: 'POST', body: JSON.stringify({ message: 'List my issues', context: { workspace: { id: 'w1' } }, agentSlug: 'cleo' }) }));
    const events = (await response.text()).trim().split('\n\n').map(event => JSON.parse(event.slice(6)));
    return { status: response.status, events, of: type => events.filter(event => event.type === type) };
  };
  return { chat, runs, provider, invalidated, issued };
}

test('the assistant offers the workspace tools to the model and runs a tool call as the signed-in member', async () => {
  const f = fixture();
  const { status, of } = await f.chat();
  assert.equal(status, 200);
  assert.deepEqual(f.provider[0].tools, [
    { name: 'whoami', description: 'The account', input_schema: { type: 'object' } },
    { name: 'issues_list', description: 'List issues', input_schema: { type: 'object', properties: { limit: { type: 'integer' } } } },
  ]);
  assert.deepEqual(f.issued, [['alice', 'w1']]);
  assert.deepEqual(f.runs.filter(run => run.name === 'issues_list'), [{ name: 'issues_list', args: { limit: 5 }, authorization: 'Bearer token-1', base: URL_, scopes: SCOPES }]);
  assert.deepEqual(of('tool_start').map(event => [event.toolName, event.toolUseId]), [['issues_list', 'toolu_1']]);
  assert.deepEqual(of('tool_result').map(event => [event.toolUseId, event.isError, event.content]), [['toolu_1', false, '{"issues":[{"issueKey":"CLB-1"}]}']]);
  // The result goes back to the model as the tool's answer, and the model's next reply ends the turn.
  assert.deepEqual(f.provider[1].messages.at(-1), { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', is_error: false, content: '{"issues":[{"issueKey":"CLB-1"}]}' }] });
  assert.equal(of('done')[0].fullContent, 'Done');
});

test('a tool failure reaches the model as an error result instead of ending the chat', async () => {
  const f = fixture({ tool: { content: [{ type: 'text', text: '{"error":"not_found"}' }], isError: true } });
  const { of } = await f.chat();
  assert.deepEqual(of('tool_result').map(event => [event.isError, event.content]), [[true, '{"error":"not_found"}']]);
  assert.equal(f.provider[1].messages.at(-1).content[0].is_error, true);
  assert.equal(of('done')[0].fullContent, 'Done');
});

test('a token that stopped working is replaced once before any tool is offered', async () => {
  const f = fixture({ handshake: [false, true] });
  await f.chat();
  assert.deepEqual(f.invalidated, [['alice', 'w1']]);
  assert.deepEqual(f.issued, [['alice', 'w1'], ['alice', 'w1']]);
  assert.deepEqual(f.runs.map(run => [run.name, run.authorization]), [['whoami', 'Bearer token-1'], ['whoami', 'Bearer token-2'], ['issues_list', 'Bearer token-2']]);
  assert.equal(f.provider[0].tools.length, 2);
});

test('when no token works the chat goes on without workspace tools and says so', async () => {
  const f = fixture({ handshake: [false] });
  const { status, of } = await f.chat();
  assert.equal(status, 200);
  assert.match(of('text')[0].content, /Workspace tools are temporarily unavailable/);
  assert.equal(f.provider[0].tools, undefined);
  assert.deepEqual(f.runs.map(run => run.name), ['whoami', 'whoami'], 'no workspace tool runs with a dead token');
});
