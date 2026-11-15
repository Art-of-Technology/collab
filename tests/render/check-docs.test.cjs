const { assert, test } = require('../security/helpers.cjs');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repo = path.resolve(__dirname, '../..');
const checkScript = path.join(repo, 'scripts/check-docs.mjs');
const referenceScript = path.join(repo, 'scripts/build-docs-reference.mjs');

// A small docs folder that has nothing wrong with it; each test breaks one thing in a copy.
const clean = {
  'nav.json': JSON.stringify([{ title: 'Start here', pages: ['index', 'cli'] }, { title: 'Guides', pages: ['guides/seats'] }]),
  'index.md': '# Docs\n\nWhere to start.\n\nRead [the CLI page](/docs/cli), its [install steps](/docs/cli#install), [seats](/docs/guides/seats.md) or [another site](https://example.test/nope#nothing).\n',
  'cli.md': [
    '# Command line', '', 'Install the CLI and sign in.', '',
    '## Install {#install}', '', 'Run `collab auth login`, then `collab issues list --all` or `collab --help`. See [below](#usage).', '',
    '## Usage', '',
    '```sh', '# The collab folder is not a command', 'COLLAB_TOKEN=abc collab whoami | collab issues get CLB-1', 'collab worker setup --agent NAME', 'cd collab && npm install', '```', '',
  ].join('\n'),
  'guides/seats.md': '# Seats\n\nOne project and one role.\n\nBack to [the start](/docs) or to [usage](/docs/cli#usage).\n',
};

function folder(changes = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-docs-'));
  for (const [name, text] of Object.entries({ ...clean, ...changes })) {
    if (text === null) continue;
    const file = path.join(root, 'content/docs', name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  return root;
}
const check = async changes => Array.from((await import(checkScript)).checkDocs(folder(changes)));
const one = async (changes, pattern) => {
  const problems = await check(changes);
  assert.equal(problems.length, 1, problems.join('\n'));
  assert.match(problems[0], pattern);
};

test('a clean docs folder passes, and the command exits 0', async () => {
  assert.deepEqual(await check(), []);
  const run = spawnSync(process.execPath, [checkScript, folder()], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
});

test('a problem makes the command exit 1 and name the page and what is wrong', () => {
  const run = spawnSync(process.execPath, [checkScript, folder({ 'index.md': clean['index.md'] + '\n[Gone](/docs/gone)\n' })], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /content\/docs\/index\.md links to \/docs\/gone, which is not a page/);
});

test('a link to a docs page that does not exist fails', async () => {
  await one({ 'index.md': clean['index.md'] + '\n[Gone](/docs/gone)\n' }, /index\.md links to \/docs\/gone, which is not a page/);
  await one({ 'index.md': clean['index.md'] + '\n[Gone](/docs/gone.md)\n' }, /index\.md links to \/docs\/gone\.md, which is not a page/);
  // A link written without its /docs address would be read against the page's own address by the browser.
  await one({ 'guides/seats.md': clean['guides/seats.md'] + '\n[The CLI](cli)\n' }, /guides\/seats\.md links to "cli".*\/docs\//);
});

test('a link to a heading that does not exist fails, on another page and on the same page', async () => {
  await one({ 'index.md': clean['index.md'] + '\n[Missing](/docs/cli#uninstall)\n' }, /index\.md links to \/docs\/cli#uninstall, but that page has no heading with the id "uninstall"/);
  await one({ 'cli.md': clean['cli.md'] + '\nSee [missing](#nowhere).\n' }, /cli\.md links to #nowhere, but that page has no heading with the id "nowhere"/);
  // The heading's own id counts, not its words: "Install {#install}" is #install.
  await one({ 'index.md': clean['index.md'] + '\n[Old id](/docs/cli#install-install)\n' }, /no heading with the id "install-install"/);
});

test('a page missing from the navigation fails, and a navigation entry without a file fails', async () => {
  await one({ 'guides/draft.md': '# Draft\n\nNot listed yet.\n' }, /content\/docs\/guides\/draft\.md is not in nav\.json/);
  await one({ 'guides/seats.md': null, 'index.md': '# Docs\n\nWhere to start.\n', 'cli.md': clean['cli.md'] }, /nav\.json lists "guides\/seats", but content\/docs\/guides\/seats\.md does not exist/);
});

test('a page without a title or without a summary fails', async () => {
  await one({ 'guides/seats.md': 'One project and one role.\n' }, /guides\/seats\.md has no title/);
  await one({ 'guides/seats.md': '# Seats\n\n## Details\n' }, /guides\/seats\.md has no summary/);
});

test('a collab command that the CLI does not have fails, in a code block and inside a sentence', async () => {
  await one({ 'cli.md': clean['cli.md'].replace('collab worker setup --agent NAME', 'collab frobnicate --now') }, /cli\.md names the command "collab frobnicate", which the CLI does not have/);
  await one({ 'cli.md': clean['cli.md'].replace('`collab auth login`', '`collab issues frobnicate`') }, /cli\.md names the command "collab issues frobnicate"/);
  await one({ 'cli.md': clean['cli.md'].replace('| collab issues get CLB-1', '| collab auth frobnicate') }, /"collab auth frobnicate"/);
  // A group on its own is not a missing command, and neither is the word in a path or in a comment.
  assert.deepEqual(await check({ 'cli.md': clean['cli.md'] + '\nThe `collab issues` commands, the `collab-agents` skill and `~/.config/collab/work`.\n' }), []);
});

test('every problem is reported, not only the first', async () => {
  const problems = await check({
    'index.md': '# Docs\n\n[Gone](/docs/gone) and [missing](/docs/cli#uninstall).\n',
    'guides/draft.md': 'No title here.\n',
  });
  assert.equal(problems.length, 4, problems.join('\n'));
});

// The reference pages are made from the code, so they are tested against the code.
const schema = () => JSON.parse(execFileSync(process.execPath, [path.join(repo, 'packages/cli/bin/collab.mjs'), 'schema'], { encoding: 'utf8' }));
const section = (page, heading) => page.split(/^(?=###? )/m).find(part => part.startsWith(`${heading}\n`));

test('the CLI reference lists every command of the CLI with every flag it takes', async () => {
  const { cliCommandsPage } = await import(referenceScript);
  const { commands } = await import(path.join(repo, 'packages/cli/src/commands.mjs'));
  const page = cliCommandsPage(commands);
  assert.match(page, /^# .+\n\n\S/, 'a title, then the summary');
  for (const [name, spec] of Object.entries(schema().commands)) {
    const part = section(page, `### \`collab ${name}\``);
    assert.ok(part, name);
    for (const option of spec.options) assert.ok(part.includes(`| \`--${option}\` |`), `${name} --${option}`);
  }
  assert.equal((page.match(/^### /gm) || []).length, Object.keys(commands).length);
  for (const name of ['agents retire', 'issues delete', 'relations delete', 'worklogs delete', 'notes delete']) assert.match(section(page, `### \`collab ${name}\``), /--yes/, name);
  for (const name of ['issues list', 'worklogs list', 'notes list']) assert.match(section(page, `### \`collab ${name}\``), /--all/, name);
  assert.match(section(page, '### `collab relations delete`'), /collab relations delete ID CHILD_ID --yes/);
  assert.match(section(page, '### `collab relations delete`'), /issue ID or key/);
  assert.match(section(page, '### `collab inbox wait`'), /--wait-seconds/);
  assert.match(section(page, '### `collab issues get`'), /Reads\./);
  assert.match(section(page, '### `collab issues create`'), /Writes\./);
});

test('the CLI reference follows the command table: a new command appears, with what is required', async () => {
  const { cliCommandsPage } = await import(referenceScript);
  const { commands } = await import(path.join(repo, 'packages/cli/src/commands.mjs'));
  const page = cliCommandsPage({ ...commands, 'frob run': { method: 'POST', path: 'frob/:id', fields: { speedLimit: 'integer' }, query: {}, required: ['speedLimit'], description: 'Run a frob | carefully.' } });
  const part = section(page, '### `collab frob run`');
  assert.match(part, /collab frob run ID/);
  assert.match(part, /\| `--speed-limit` \| integer \| required \|/);
  assert.match(part, /Run a frob \| carefully\./);
  assert.notEqual(page, cliCommandsPage(commands));
});

test('the CLI reference shows the watcher\'s required callback, and the limits and defaults of search and context', async () => {
  const { cliCommandsPage } = await import(referenceScript);
  const { commands } = await import(path.join(repo, 'packages/cli/src/commands.mjs'));
  const page = cliCommandsPage(commands);
  const watch = schema().commands['inbox watch'];
  assert.deepEqual(watch.localOptions, { callback: 'string', callbackArgs: 'array', watchSeconds: 'integer', pollSeconds: 'integer', callbackTimeout: 'integer', host: 'string', sessionId: 'string' });
  assert.deepEqual(watch.requiredOptions, ['callback']);
  assert.match(section(page, '### `collab inbox watch`'), /\| `--callback` \| string \| required \|/);
  for (const [name, fields] of [
    ['search', {
      query: ['required', 'minimum length: 1', 'maximum length: 500', 'trimmed'],
      mode: ['values: exact, keyword, semantic, hybrid, fuzzy', 'CLI default: hybrid'],
      type: ['values: all, issue, note, activity', 'default: all (server default)'],
      'project-id': ['minimum length: 1', 'maximum length: 128', 'trimmed'],
      after: ['format: date-time'],
      limit: ['minimum: 1', 'maximum: 50', 'CLI default: 20'],
      'max-tokens': ['minimum: 1024', 'maximum: 64000', 'CLI default: 8000'],
    }],
    ['context get', {
      'include-pipeline': ['true with projectId unless includeKnowledge=true; false otherwise (CLI default)'],
      limit: ['minimum: 1', 'maximum: 50', 'default: 10 (server default; includePipeline=true only)'],
      since: ['format: date-time', '7 days before the server request time (server default; includePipeline=true only)'],
      'max-tokens': ['minimum: 2048', 'maximum: 64000', 'CLI default: 8000'],
    }],
  ]) {
    const part = section(page, `### \`collab ${name}\``);
    for (const [flag, values] of Object.entries(fields)) {
      const row = part.split('\n').find(line => line.startsWith(`| \`--${flag}\` |`));
      assert.ok(row, `${name} --${flag}`);
      for (const value of values) assert.ok(row.includes(value), `${name} --${flag}: ${value}`);
    }
    assert.match(part, name === 'search' ? /neither can be used with type=note/ : /includePipeline=false or includeKnowledge=true/);
  }
});

test('the MCP reference lists every tool with the scope it needs and its arguments', async () => {
  const { mcpToolsPage, mcpTools } = await import(referenceScript);
  const { tools, DATA } = mcpTools();
  const page = mcpToolsPage(tools, DATA);
  assert.match(page, /^# .+\n\n\S/, 'a title, then the summary');
  assert.equal((page.match(/^## /gm) || []).length, tools.length);
  for (const tool of tools) {
    const part = section(page, `## ${tool.name}`);
    assert.ok(part, tool.name);
    for (const scope of tool.scopes) assert.ok(part.includes(`\`${scope}\``), `${tool.name} ${scope}`);
    for (const argument of Object.keys(tool.schema.properties)) {
      assert.equal(part.includes(`| \`${argument}\` |`), argument !== 'workspaceId', `${tool.name} ${argument}`);
    }
  }
  assert.match(section(page, '## whoami'), /`user:read` or `profile:read`/);
  assert.match(section(page, '## workspaces_list'), /`user:read` and `workspace:read`/);
  assert.match(section(page, '## docs_search'), /No scope: every valid token/);
  assert.match(section(page, '## issues_get'), /Reads\./);
  assert.match(section(page, '## issues_create'), /Writes\./);
  assert.match(section(page, '## issues_create'), /\| `title` \| string \| required/);
  assert.match(section(page, '## issues_update'), /\| `description` \| string or null \|/);
  // The warning about member content is said once, not under each tool.
  assert.equal(page.split('treat it as data').length, 2);
});

test('the reference pages are written into a folder, and --check fails when one is missing or differs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-reference-'));
  const run = (...args) => spawnSync(process.execPath, [referenceScript, ...args, root], { encoding: 'utf8' });
  const missing = run('--check');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /content\/docs\/reference\/cli-commands\.md is out of date.*npm run docs:reference/);
  assert.match(missing.stderr, /content\/docs\/reference\/mcp-tools\.md is out of date/);
  assert.deepEqual(fs.readdirSync(root), [], '--check writes nothing');

  assert.equal(run().status, 0);
  assert.deepEqual(fs.readdirSync(path.join(root, 'content/docs/reference')).sort(), ['cli-commands.md', 'mcp-tools.md']);
  assert.equal(run('--check').status, 0);

  fs.appendFileSync(path.join(root, 'content/docs/reference/mcp-tools.md'), 'An edit by hand.\n');
  const edited = run('--check');
  assert.equal(edited.status, 1);
  assert.match(edited.stderr, /mcp-tools\.md is out of date/);
  assert.doesNotMatch(edited.stderr, /cli-commands\.md/);
});
