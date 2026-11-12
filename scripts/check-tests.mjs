#!/usr/bin/env node
// Runs the security and render suites and compares the tests that fail with tests/known-failures.txt.
// Some tests have failed on main for a long time; listing them lets a pull request be judged by what
// it changes. The run fails when a test fails that is not listed (a regression) and when a listed test
// passes (delete its line, so the list only shrinks). `--update` rewrites the list from this run.
import { run } from 'node:test';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const LIST = 'tests/known-failures.txt';
const files = ['tests/security', 'tests/render'].flatMap(folder =>
  readdirSync(folder).filter(name => name.endsWith('.test.cjs')).sort().map(name => join(folder, name)));

const failing = [];
let passed = 0;
// One file at a time, as `npm run test:security` does: several files start their own PostgreSQL.
for await (const event of run({ files, concurrency: 1 })) {
  if (event.type === 'test:pass') passed++;
  // A test is named by its file and its own name, so a new failing subtest shows even when its parent already fails.
  if (event.type === 'test:fail') failing.push(`${relative(process.cwd(), event.data.file ?? '')} > ${event.data.name}`);
}
failing.sort();

if (process.argv.includes('--update')) {
  writeFileSync(LIST, failing.map(line => `${line}\n`).join(''));
  console.log(`${LIST} rewritten: ${failing.length} failing, ${passed} passing.`);
  process.exit(0);
}

// Lines are compared as a multiset: two tests in one file may share a name.
const count = lines => lines.reduce((counts, line) => counts.set(line, (counts.get(line) ?? 0) + 1), new Map());
const known = count(readFileSync(LIST, 'utf8').split('\n').filter(Boolean));
const now = count(failing);
const extra = (a, b) => [...a].flatMap(([line, n]) => Array(Math.max(0, n - (b.get(line) ?? 0))).fill(line));
const regressions = extra(now, known);
const fixed = extra(known, now);

console.log(`${passed} passing, ${failing.length} failing, ${failing.length - regressions.length} of them listed in ${LIST}.`);
if (regressions.length) {
  console.log(`\nFailing and not listed (${regressions.length}). Run the file with \`node --test <file>\` for the error:`);
  for (const line of regressions) console.log(`  ${line}`);
}
if (fixed.length) {
  console.log(`\nListed but passing now (${fixed.length}). Delete these lines from ${LIST}:`);
  for (const line of fixed) console.log(`  ${line}`);
}
process.exit(regressions.length || fixed.length ? 1 : 0);
