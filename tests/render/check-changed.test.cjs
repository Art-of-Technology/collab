const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const script = path.resolve(__dirname, '../../scripts/check-changed.mjs');
const record = `require('node:fs').appendFileSync('.calls', JSON.stringify(entry) + '\\n');\n`;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-changed-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  function write(name, body = '') {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }

  function git(...args) {
    execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', ...args], {
      cwd: root,
      stdio: 'pipe',
    });
  }

  function writeTest(name, fails = false) {
    write(name, `const entry = ['test', ${JSON.stringify(name)}];
${record}
require('node:test').test('fixture test', () => require('node:assert/strict').equal(${fails}, false));
`);
  }

  write('.gitignore', '/node_modules/\n/.calls\n');
  write('package.json', JSON.stringify({ scripts: { 'docs:check': 'node docs-check.cjs' } }));
  write('docs-check.cjs', "const entry = ['docs:check'];\n" + record);
  write('node_modules/typescript/bin/tsc', "const entry = ['tsc', process.execArgv, process.argv.slice(2)];\n" + record);
  write('node_modules/eslint/bin/eslint.js', "const entry = ['eslint', ...process.argv.slice(2)];\n" + record);
  for (const name of ['branch', 'staged', 'unstaged', 'removed', 'unchanged']) {
    writeTest(`tests/${name}.test.cjs`);
  }
  git('init', '--initial-branch=main');
  git('add', '.');
  git('commit', '-m', 'Base');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');

  function run(...args) {
    const log = path.join(root, '.calls');
    fs.rmSync(log, { force: true });
    const env = { ...process.env };
    // The command starts its own Node test run, outside this test runner.
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8', env });
    return {
      ...result,
      output: result.stdout + result.stderr,
      calls: fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse) : [],
    };
  }

  return { git, run, write, writeTest };
}

const testFiles = run => run.calls.filter(([command]) => command === 'test').map(([, name]) => name).sort();

test('runs only the changed test files', t => {
  const { git, run, write, writeTest } = fixture(t);
  write('main-only.test.cjs', 'throw new Error("only on main");');
  git('add', '.');
  git('commit', '-m', 'Advance main');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  git('checkout', '-b', 'seat/fixture', 'HEAD^');

  writeTest('tests/branch.test.cjs', true);
  git('commit', '-am', 'Branch change');
  // Change the committed file too, to exercise deduplication across Git states.
  writeTest('tests/branch.test.cjs');
  git('rm', 'tests/removed.test.cjs');
  const one = run();
  assert.equal(one.status, 0, one.output);
  assert.deepEqual(testFiles(one), ['tests/branch.test.cjs']);
  assert.deepEqual(one.calls.find(([command]) => command === 'tsc'),
    ['tsc', ['--max-old-space-size=3072'], ['--noEmit', '-p', '.']]);
  const lintArgs = one.calls.find(([command]) => command === 'eslint').slice(1);
  assert.ok(lintArgs.includes('tests/branch.test.cjs'));
  assert.equal(lintArgs.filter(arg => arg.endsWith('.cjs')).length, 1);

  for (const name of ['staged', 'unstaged']) {
    write(`tests/${name}.test.cjs`, `const entry = ['test', 'tests/${name}.test.cjs'];\n` + record);
    if (name === 'staged') git('add', 'tests/staged.test.cjs');
  }
  writeTest('tests/untracked [draft].test.cjs');
  const many = run('./tests/branch.test.cjs', 'tests/unchanged.test.cjs');
  assert.equal(many.status, 0, many.output);
  assert.deepEqual(testFiles(many), [
    'tests/branch.test.cjs',
    'tests/staged.test.cjs',
    'tests/unchanged.test.cjs',
    'tests/unstaged.test.cjs',
    'tests/untracked [draft].test.cjs',
  ]);
});

test('adds the docs check when a docs page or a command list changed', t => {
  for (const [changed, expected] of [
    ['content/docs/guides/seats.md', true],
    ['packages/cli/src/commands.mjs', true],
    ['src/lib/mcp-tools.ts', true],
    ['content/docs-draft/page.md', false],
  ]) {
    const { run, write } = fixture(t);
    write(changed);
    const result = run();
    assert.equal(result.status, 0, `${changed}\n${result.output}`);
    assert.equal(result.calls.some(([command]) => command === 'docs:check'), expected, changed);
    assert.deepEqual(testFiles(result), []);
    assert.match(result.output, /SKIP.*node --test.*no changed test files/i);
    if (changed.endsWith('.md')) assert.ok(!result.calls.some(([command]) => command === 'eslint'));
  }
});

test('exits non-zero and names the step when a step fails', t => {
  const { run, write, writeTest } = fixture(t);
  writeTest('tests/failure.test.cjs', true);
  write('content/docs/page.md');
  const result = run();
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /FAIL.*node --test/);
  assert.deepEqual(result.calls.map(([command]) => command), ['test', 'tsc', 'eslint', 'docs:check']);
  for (const step of ['tsc', 'eslint', 'docs:check']) {
    assert.match(result.output, new RegExp(`PASS.*${step}`));
  }
});
