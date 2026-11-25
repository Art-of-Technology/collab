#!/usr/bin/env node
// Reads changed paths, one per line, and prints `true` when they are all documentation, else `false`.
// Documentation: anything under docs/ or content/docs/, and a .md file outside the code folders.
// The Tests and build workflow runs only the docs check for a pull request that is docs-only.
import { readFileSync } from 'node:fs';

const code = /^(src|packages|prisma|scripts|tests)\//;
// Git never prints `..` or `.`; a path with one is refused rather than trusted to stay inside docs/.
const plain = path => !path.split('/').some(part => ['', '.', '..'].includes(part));
const docs = path => plain(path) && (/^(content\/)?docs\//.test(path) || (path.endsWith('.md') && !code.test(path)));

const paths = readFileSync(0, 'utf8').split('\n').filter(Boolean);
console.log(String(paths.length > 0 && paths.every(docs)));
