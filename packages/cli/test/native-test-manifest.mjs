import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const sourceOnly = 'update is listed, takes no arguments, and refuses to run the installer outside the installed native executable';
// Exclude the test file's root name; matching it makes Node run every test in a shard.
export const patterns = ['^(?!.*cli\\.test\\.mjs$)[rR]', '^(?!.*cli\\.test\\.mjs$)[wWiI]', '^(?!.*cli\\.test\\.mjs$)[a-hj-qst-vx-zA-HJ-QST-VX-Z]'];
const count = values => values.reduce((map, value) => map.set(value, (map.get(value) || 0) + 1), new Map());
const sorted = values => [...values].sort();

export function manifest(raw) {
  const text = Buffer.isBuffer(raw)
    ? raw[0] === 0xff && raw[1] === 0xfe ? raw.toString('utf16le') : raw.toString('utf8')
    : raw;
  const names = [...text.matchAll(/^\s*# Subtest: (.*)\r?$/gm)].map(match => match[1].replace(/\r$/, ''));
  const skips = [...text.matchAll(/^\s*ok \d+ - (.*?) # SKIP(?: .*)?\r?$/gm)].map(match => match[1]);
  const summary = text.match(/^# tests (\d+)\r?$/m);
  const failures = text.match(/^# fail (\d+)\r?$/m);
  if (!summary || !failures || Number(failures[1]) !== 0 || Number(summary[1]) !== names.length || !names.length) {
    throw new Error('Incomplete or failed TAP report');
  }
  return { names, skips };
}

export function verify(source, shards) {
  if (shards.length !== 3) throw new Error('All three installed CLI shards are required');
  const actual = shards.flatMap(shard => shard.names);
  const expectedCounts = count(source.names), actualCounts = count(actual);
  if (expectedCounts.size !== actualCounts.size || [...expectedCounts].some(([name, n]) => actualCounts.get(name) !== n)) {
    throw new Error('Installed CLI shards do not cover the source test names exactly once');
  }
  if (expectedCounts.get(sourceOnly) !== 1) throw new Error('Expected source-only update test is missing');
  const expectedSkips = [...source.skips, sourceOnly];
  if (JSON.stringify(sorted(expectedSkips)) !== JSON.stringify(sorted(shards.flatMap(shard => shard.skips)))) {
    throw new Error('Installed CLI test skips differ from the source suite');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [, , action, ...paths] = process.argv;
  if (action === 'pattern' && paths.length === 1 && /^[1-3]$/.test(paths[0])) {
    console.log(patterns[Number(paths[0]) - 1]);
  } else if (action === 'record' && paths.length === 2) {
    writeFileSync(paths[1], JSON.stringify(manifest(readFileSync(paths[0]))));
  } else if (action === 'verify' && paths.length === 4) {
    const [source, ...shards] = paths.map(path => JSON.parse(readFileSync(path, 'utf8')));
    verify(source, shards);
    console.log('Installed CLI shards cover all source tests and nested subtests exactly once.');
  } else {
    throw new Error('Use pattern SHARD, record TAP OUTPUT or verify SOURCE SHARD1 SHARD2 SHARD3');
  }
}
