const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { test } = require('node:test');

const script = resolve(__dirname, '../../scripts/docs-only.mjs');

function docsOnly(paths) {
  const result = spawnSync(process.execPath, [script], { input: paths.map(path => `${path}\0`).join(''), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test('a change to documentation only is docs-only', () => {
  assert.equal(docsOnly(['docs/agent-search.md']), 'true');
  assert.equal(docsOnly(['docs/café.png']), 'true');
  assert.equal(docsOnly(['content/docs/line\nbreak.png']), 'true');
  assert.equal(docsOnly(['content/docs/cli.md']), 'true');
  assert.equal(docsOnly(['content/docs/nav.json']), 'true');
  assert.equal(docsOnly(['README.md']), 'true');
  assert.equal(docsOnly(['.github/pull_request_template.md', 'docs/design/a.png']), 'true');
  assert.equal(docsOnly(['docsx/a.md']), 'true');
});

test('one file outside documentation makes the change not docs-only', () => {
  assert.equal(docsOnly(['src/app/README.md']), 'false');
  assert.equal(docsOnly(['packages/cli/README.md']), 'false');
  assert.equal(docsOnly(['prisma/README.md']), 'false');
  assert.equal(docsOnly(['scripts/MIGRATION_GUIDE.md']), 'false');
  assert.equal(docsOnly(['tests/README.md']), 'false');
  assert.equal(docsOnly(['content/docs/cli.md', 'src/lib/docs.ts']), 'false');
  assert.equal(docsOnly(['.github/workflows/tests-and-build.yml']), 'false');
  assert.equal(docsOnly(['docsx/a.ts']), 'false');
  assert.equal(docsOnly(['docs/../src/x.ts']), 'false');
  assert.equal(docsOnly(['docs/../src/x.md']), 'false');
});

test('no changed files is not docs-only', () => {
  assert.equal(docsOnly([]), 'false');
});
