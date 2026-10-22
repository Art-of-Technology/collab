const { assert, test, load } = require('./helpers.cjs');
const { Prisma } = require('@prisma/client');

const forge = load('src/lib/forge/legacy-write-guard.ts', {
  'server-only': {}, '@/lib/prisma': {}, './reader': {},
});
const lifecycle = load('src/lib/issue-trash.ts', {
  'server-only': {}, '@/lib/prisma': {}, '@/lib/forge/legacy-write-guard': forge,
  '@/lib/permissions': {}, '@/lib/event-bus': {},
});
const privateDetail = 'PRIVATE_TOKEN_AND_QUERY_SENTINEL';
const conflictMessage = 'Issue changed or still has protected references; reload and retry';
const knownError = code => new Prisma.PrismaClientKnownRequestError(privateDetail, {
  code, clientVersion: privateDetail, meta: { query: privateDetail },
});
const handled = [
  ...[[400, 'validation_error'], [403, 'forbidden'], [404, 'not_found'], [409, 'issue_conflict']].map(([status, code]) => ({
    error: new lifecycle.IssueTrashError(status, `Public explanation for ${status}`), status, code,
    description: `Public explanation for ${status}`,
    browser: { error: `Public explanation for ${status}`, error_description: `Public explanation for ${status}` },
  })),
  { error: new forge.ForgeProjectWriteError(), status: 409, code: 'forge_connected_project',
    description: new forge.ForgeProjectWriteError().message, browser: { error: new forge.ForgeProjectWriteError().message } },
  ...['P2025', 'P2034', 'P2003'].map(code => ({
    error: knownError(code), status: 409, code: 'issue_conflict', description: conflictMessage,
    browser: { error: conflictMessage },
  })),
];

function fixture() {
  const logs = [];
  let failure;
  const fail = async () => { throw failure; };
  const deps = {
    'next/server': { NextResponse: Response }, '@prisma/client': { Prisma }, zod: require('zod'),
    '@/lib/prisma': {}, '@/lib/agent-label-triggers': {}, '@/lib/event-bus': {},
    '@/lib/forge/legacy-write-guard': forge,
    '@/lib/issue-trash': { ...lifecycle, changeIssueTrash: fail, previewIssueTrash: fail, listIssueTrash: fail },
    '@/lib/apps/auth-middleware': { withAppAuth: handler => handler },
  };
  const globals = { URL, Error, console: { error: (...args) => logs.push(args) } };
  deps['@/lib/issue-trash-response'] = load('src/lib/issue-trash-response.ts', deps, globals);
  const context = { workspace: { id: 'workspace' }, user: { id: 'user' }, app: { id: 'app' }, installation: { id: 'installation' } };
  return {
    logs, respond: deps['@/lib/issue-trash-response'].issueTrashErrorResponse,
    route(file, method) {
      const handler = load(file, deps, globals)[method];
      return error => {
        failure = error;
        return handler(new Request('https://example.test?projectId=project'), context,
          { params: Promise.resolve({ issueIdOrKey: 'ISSUE-1' }) });
      };
    },
  };
}

test('handled Trash failures preserve browser bodies and stable app codes without logging', async () => {
  const f = fixture();
  for (const row of handled) {
    const browser = f.respond(row.error);
    assert.equal(browser.status, row.status);
    assert.deepEqual(await browser.json(), row.browser);
    const app = f.respond(row.error, 'app');
    assert.equal(app.status, row.status);
    assert.deepEqual(await app.json(), { error: row.code, error_description: row.description });
  }
  assert.deepEqual(f.logs, []);
});

test('unexpected failures emit one bounded diagnostic without private error data', async () => {
  const error = new Error(privateDetail);
  error.name = privateDetail;
  error.stack = privateDetail;
  error.code = privateDetail;
  for (const [failure, diagnostic] of [
    [error, { category: 'error' }],
    [knownError('P2002'), { category: 'prisma', code: 'P2002' }],
    [knownError(`P2002\n${privateDetail}`), { category: 'prisma' }],
    [{ message: privateDetail, stack: privateDetail, meta: privateDetail, code: 'P2002' }, { category: 'unknown' }],
  ]) {
    for (const client of ['browser', 'app']) {
      const f = fixture();
      const response = f.respond(failure, client);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), client === 'app'
        ? { error: 'server_error', error_description: 'Internal server error' }
        : { error: 'Unable to update Trash' });
      assert.deepEqual(JSON.parse(JSON.stringify(f.logs)), [['issue_trash_unexpected_failure', diagnostic]]);
      assert.equal(JSON.stringify(f.logs).includes(privateDetail), false);
    }
  }
});

for (const [name, file, method] of [
  ['delete', 'src/app/api/apps/auth/issues/[issueIdOrKey]/route.ts', 'DELETE'],
  ['preview', 'src/app/api/apps/auth/issues/[issueIdOrKey]/delete-preview/route.ts', 'GET'],
  ['restore', 'src/app/api/apps/auth/issues/[issueIdOrKey]/restore/route.ts', 'POST'],
  ['list', 'src/app/api/apps/auth/issues/trash/route.ts', 'GET'],
]) {
  test(`app Trash ${name} executes the shared machine-readable error contract`, async () => {
    const f = fixture();
    const invoke = f.route(file, method);
    for (const row of handled) {
      const response = await invoke(row.error);
      assert.equal(response.status, row.status);
      assert.deepEqual(await response.json(), { error: row.code, error_description: row.description });
    }
    assert.deepEqual(f.logs, []);
    const response = await invoke(new Error(privateDetail));
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'server_error', error_description: 'Internal server error' });
    assert.deepEqual(JSON.parse(JSON.stringify(f.logs)), [['issue_trash_unexpected_failure', { category: 'error' }]]);
    assert.equal(JSON.stringify(f.logs).includes(privateDetail), false);
  });
}
