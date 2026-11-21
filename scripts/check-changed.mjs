import { execFileSync, spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

function changedFiles() {
  const diff = ['diff', '--name-only', '-z', '--no-renames'];
  const paths = [
    [...diff, 'origin/main...HEAD'],
    [...diff, '--cached'],
    diff,
    ['ls-files', '-z', '--others', '--exclude-standard'],
  ].flatMap(args => execFileSync('git', args, { encoding: 'utf8' }).split('\0').filter(Boolean));

  return [...new Set(paths)].filter(file => statSync(file, { throwIfNoEntry: false })?.isFile()).sort();
}

function runStep(name, command, args, options) {
  console.log(`\nRUN  ${name}`);
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status === 0) {
    console.log(`PASS ${name}`);
    return;
  }
  const reason = result.error?.message ?? result.signal ?? `exit ${result.status}`;
  console.error(`FAIL ${name} (${reason})`);
  process.exitCode = 1;
}

let files = [];
try {
  files = changedFiles();
} catch (error) {
  console.error(`FAIL find changed files (${error.message})`);
  process.exitCode = 1;
}

const testFiles = files.filter(file => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file));
const extraTests = process.argv.slice(2).map(file => relative(process.cwd(), resolve(file)).split(sep).join('/'));
const tests = [...new Set([...testFiles, ...extraTests])];
if (tests.some(file => /[{}\\]/.test(file))) {
  // Node's CLI expands braces and treats backslashes as separators even inside glob patterns.
  runStep('node --test', process.execPath, ['-', ...tests], {
    stdio: ['pipe', 'inherit', 'inherit'],
    input: `
    import { run } from 'node:test';
    import { tap } from 'node:test/reporters';
    run({ files: process.argv.slice(2), concurrency: true })
      .on('test:fail', () => { process.exitCode = 1; })
      .compose(tap)
      .pipe(process.stdout);
    `,
  });
} else if (tests.length) {
  // Node treats test arguments as glob patterns, even for existing files.
  const patterns = tests.map(file => file.replace(/[[\]*?()]/g, char => `[${char}]`));
  runStep('node --test', process.execPath, ['--test', '--', ...patterns]);
} else {
  console.log('SKIP node --test (no changed test files or extra test files)');
}

runStep('tsc', process.execPath, [
  '--max-old-space-size=3072', 'node_modules/typescript/bin/tsc', '--noEmit', '-p', '.',
]);

const lintFiles = files.filter(file => /\.(?:[cm]?[jt]s|[jt]sx)$/.test(file));
if (lintFiles.length) {
  runStep('eslint', process.execPath, [
    'node_modules/eslint/bin/eslint.js', '--no-warn-ignored', '--', ...lintFiles,
  ]);
} else {
  console.log('SKIP eslint (no changed JavaScript or TypeScript files)');
}

if (files.some(file => file.startsWith('content/docs/') ||
  file === 'packages/cli/src/commands.mjs' || file === 'src/lib/mcp-tools.ts')) {
  runStep('npm run docs:check', 'npm', ['run', 'docs:check'], { shell: process.platform === 'win32' });
} else {
  console.log('SKIP npm run docs:check (no changed docs or command lists)');
}
