#!/usr/bin/env node
// Fails when the published documentation (content/docs) has gone wrong in a way a reader would hit:
// a link to a page or heading that does not exist, a page that is not in the navigation (or the reverse),
// a page without a title or summary, or a `collab` command the CLI in this repository does not have.
// `npm run docs:check` runs it in the lint job. An optional argument names another root folder (the tests use it).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadTs } from './load-ts.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

// `collab` where a shell would run it: at the start of a line or after | ; & ( `, with an optional prompt and
// variable assignments before it. The lower-case words after it are the command.
const COMMAND = /(?:^|[|;&(`])[ \t]*(?:\$[ \t]+)?(?:[A-Za-z_][A-Za-z0-9_]*=(?:[^\s'"\\]|\\.|'[^']*'|"(?:[^"\\]|\\.)*")*[ \t]+)*collab((?:[ \t]+[a-z][a-z0-9-]*)*)/gm;

// Every command the CLI says it has: the API commands and the ones that run on the computer only.
function cliCommands() {
  const schema = JSON.parse(execFileSync(process.execPath, [join(repo, 'packages/cli/bin/collab.mjs'), 'schema'], { encoding: 'utf8' }));
  return new Set(['help', ...Object.keys(schema.commands), ...Object.keys(schema.workerCommands), ...Object.keys(schema.coordinatorCommands),
    ...schema.localCommands.map(command => command.match(/^[a-z-]+( [a-z-]+)?/)[0])]);
}

/** Every problem in the docs folder under `root`, one sentence each. An empty list means nothing is wrong. */
export function checkDocs(root = repo) {
  // The app's own loader, so a title, a summary and a heading id mean here what they mean on the page.
  const { docPage, docHref } = loadTs(join(repo, 'src/lib/docs.ts'), require, { process: { cwd: () => root } });
  const { lexer, walkTokens } = require('marked');
  const folder = join(root, 'content', 'docs');
  const problems = [];

  const files = readdirSync(folder, { recursive: true }).filter(name => name.endsWith('.md')).map(name => name.slice(0, -3).split(sep).join('/')).sort();
  const listed = JSON.parse(readFileSync(join(folder, 'nav.json'), 'utf8')).flatMap(section => section.pages);
  for (const slug of listed) if (!files.includes(slug)) problems.push(`nav.json lists "${slug}", but content/docs/${slug}.md does not exist.`);
  for (const slug of files) if (!listed.includes(slug)) problems.push(`content/docs/${slug}.md is not in nav.json.`);

  const pages = new Map(files.map(slug => [slug, docPage(slug)]));
  const commands = cliCommands();
  const groups = new Set([...commands].map(name => name.split(' ')[0]));

  for (const [slug, page] of pages) {
    const file = `content/docs/${slug}.md`;
    if (!page) { problems.push(`${file} cannot be a page: a file name is lower-case letters, digits and hyphens.`); continue; }
    if (!page.title) problems.push(`${file} has no title: its first heading must be "# Title".`);
    else if (!page.summary) problems.push(`${file} has no summary: the first paragraph after the title says what the page is.`);

    walkTokens(lexer(page.markdown), token => {
      if (token.type === 'link') {
        const href = token.href;
        if (!/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(href)) return problems.push(`${file} links to "${href}": write the whole address, starting with /docs/.`);
        try {
          const url = new URL(href, `https://docs.invalid${docHref(slug)}`);
          // /docs, /docs.md, /docs/<page> and /docs/<page>.md are documentation; other addresses are not checked.
          const address = url.origin === 'https://docs.invalid' && url.pathname.match(/^\/docs(?:\/(.+?))?(\.md)?$/);
          if (!address) return;
          const target = pages.get(decodeURIComponent(address[1] ?? 'index'));
          const id = decodeURIComponent(url.hash.slice(1));
          // A file in public/ is served at its own address (the developer docs keep two under /docs).
          if (!target) { if (!existsSync(join(root, 'public', url.pathname))) problems.push(`${file} links to ${href}, which is not a page.`); }
          else if (id && !address[2] && !target.headings.some(heading => heading.id === id)) problems.push(`${file} links to ${href}, but that page has no heading with the id "${id}".`);
        } catch {
          // new URL and decodeURIComponent throw on an address no browser can read, on this site or on another.
          problems.push(`${file} links to "${href}", which is not an address a browser can read.`);
        }
      } else if (token.type === 'code' || token.type === 'codespan') {
        // A shell comment is words, not a command line.
        for (const [, after] of token.text.replace(/(^|\s)#.*$/gm, '$1').matchAll(COMMAND)) {
          const words = after.trim().split(/[ \t]+/).filter(Boolean).slice(0, 2);
          const known = !words.length || commands.has(words.join(' ')) || commands.has(words[0]) || (words.length === 1 && groups.has(words[0]));
          if (!known) problems.push(`${file} names the command "collab ${words.join(' ')}", which the CLI does not have (packages/cli).`);
        }
      }
    });
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const problems = checkDocs(process.argv[2] ? resolve(process.argv[2]) : repo);
  for (const problem of problems) console.error(problem);
  console.log(problems.length ? `content/docs: ${problems.length} to fix.` : 'content/docs: nothing wrong.');
  process.exit(problems.length ? 1 : 0);
}
