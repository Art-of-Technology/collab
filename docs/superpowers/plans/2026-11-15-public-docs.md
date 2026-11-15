# Public Documentation Implementation Plan

> For agentic workers: The workspace owner chose one fresh session for this plan (15 Nov 2026). Use superpowers:executing-plans. Each task is its own pull request through the repository's usual pipeline (docs-only tasks may skip the pipeline's test step, never its review).

**Goal:** public documentation where the page a person reads, the Markdown an agent reads and the search both use come from one set of files.

**Architecture:** Markdown files and one navigation file in `content/docs/`; one loader library; static pages under `/docs`; route handlers for the Markdown and index outputs; one search index built before the build and used in the browser and on the server.

**Tech stack:** Next.js 16 App Router (static params), `react-markdown` with the existing renderer, the existing Mermaid loader, `cmdk`, MiniSearch (new), Node scripts.

**Spec:** the "Documentation" part of `docs/superpowers/specs/2026-11-15-agent-seats-and-docs-design.md`.

### Global constraints

- One new dependency: `minisearch`. No MDX, no docs framework. The production build must still pass at a 3072 MB heap; compare with `main` at the same value if it fails.
- Published pages live only in `content/docs/`. Nothing from `docs/` is published by a script.
- Tests go in `tests/render/`, because `npm test` (the `full tests` check) runs only `tests/security` and `tests/render` (`scripts/check-tests.mjs:11`). A test anywhere else would never run in CI.
- `/docs` and `/docs/cli` keep answering 200 without sign-in, and the section ids that existing links use (`#installation`, `#authentication`, `#agents`, `#commands`) keep existing on `/docs/cli`.
- Page shape: first line `# Title`, then one summary line, then content. Lists of at most seven items; steps numbered.
- No private runbook content: no host names, service names or roles.
- Docs pages are written for the product as it is on `main`; a page about seats is added by the task that ships the behaviour.

### Review focus

1. A page exists in `content/docs/` but not in the navigation (or the reverse): the check fails. Test in B5.
2. The Markdown output differs from what the page renders: both must come from the same loader call. Test in B2.
3. A search for a term that appears only in a code block still finds the page. Test in B4.
4. A page's headings repeat (two "Example" headings): anchors stay unique and links to the second one work. Test in B1.
5. The files are missing from the production bundle (standalone output does not trace `content/`): the build includes them. Checked in B1.

### Task B1: content folder and loader

**Files:** create `content/docs/nav.json`, `content/docs/index.md`, `src/lib/docs.ts`; modify `next.config.js` (`outputFileTracingIncludes` for `content/docs/**`); test `tests/render/docs-lib.test.cjs` (loaded with `load()` from `tests/security/helpers.cjs`).

**Produces:**
- `docsNav() → { title: string; pages: { slug: string; title: string }[] }[]`
- `docPage(slug: string) → { slug; title; summary; markdown; headings: { depth: 2 | 3; text: string; id: string }[] } | null`
- `allDocs() → DocPage[]` in navigation order
- `headingId(text: string, seen: Map<string, number>) → string`

- [ ] Tests: title is the first `# ` line and summary the first paragraph after it; repeated headings get `-2`, `-3`; an unknown slug gives null; a slug with `..` gives null.
- [ ] The app builds with `output: 'standalone'` (`next.config.js:4`) and the image copies only `.next/standalone`, `.next/static` and `public` (`Dockerfile:62-76`). Verify by starting the built standalone server, not `next dev`, and fetching a docs page and its `.md`.

### Task B2: what agents read

**Files:** create `src/app/docs/raw/[...slug]/route.ts`, `src/app/llms.txt/route.ts`, `src/app/llms-full.txt/route.ts`; modify `next.config.js` (rewrite `/docs/:path*.md` to `/docs/raw/:path*`); test `tests/render/docs-routes.test.cjs`.

- [ ] If the rewrite cannot match the `.md` suffix, serve the Markdown at `/docs/raw/<slug>` and list those addresses in `llms.txt`; whichever address is used, the test below hits it on the built server.
- [ ] Tests: `/docs/<slug>.md` returns `text/markdown` and exactly `docPage(slug).markdown`; `/llms.txt` has one line per navigation page with title, summary and the `.md` address; `/llms-full.txt` is every page in navigation order.

### Task B3: pages for people

**Files:** create `src/app/docs/layout.tsx`, `src/app/docs/[[...slug]]/page.tsx`, `src/components/docs/DocsSidebar.tsx`, `OnThisPage.tsx`, `CopyMarkdownButton.tsx`, `DocsDiagrams.tsx`; remove `src/app/docs/page.tsx`, `src/app/docs/cli/page.tsx`, `src/app/docs/installation.tsx` after their text has moved into Markdown; keep `src/app/docs/command-reference.tsx` only until B5 replaces it; test `tests/render/docs-page.test.cjs`.

- [ ] Move the eleven sections of today's page (`src/app/docs/page.tsx:26-38`) into Markdown pages; `/docs/cli` becomes a page whose headings carry the old ids.
- [ ] Render with `MarkdownRenderer`; `DocsDiagrams` calls `renderDiagrams(container)` from `src/lib/mermaid-diagrams.ts` after mount.
- [ ] Tests: the page for a slug shows its title, its headings in the right rail, previous and next from the navigation, and "copy page as Markdown" copies the loader's Markdown.

### Task B4: one search for people and agents

**Files:** create `scripts/build-docs-index.mjs`, `src/lib/docs-search.ts`, `src/components/docs/DocsSearch.tsx`, `src/app/api/apps/auth/docs/route.ts`, `src/app/api/apps/auth/docs/[...slug]/route.ts`; modify `package.json` (`docs:index`, and run it in `build`), `src/lib/mcp-tools.ts`; test `tests/render/docs-search.test.cjs`.

**Produces:**
- Index file `public/docs-index.json`: one entry per heading section `{ id; slug; title; heading; anchor; text }`.
- `searchDocs(index, query: string, limit = 8) → { slug; title; heading; anchor; excerpt }[]` (MiniSearch: prefix and fuzzy, heading boosted over text).
- MCP tools `docs_search { query, limit? }` and `docs_get { slug }`.

- [ ] Test: the same query through `searchDocs` and through the `docs` route returns the same slugs in the same order (this pins "agents and people get the same results").
- [ ] Tests: a word with one typo still finds its page; a term that only occurs in a code block finds its page; an empty query returns nothing.
- [ ] ⌘K opens the search from every docs page; choosing a hit goes to the page and anchor.

### Task B5: the check and the generated reference

**Files:** create `scripts/check-docs.mjs`, `scripts/build-docs-reference.mjs`, `content/docs/reference/cli-commands.md`, `content/docs/reference/mcp-tools.md`; modify `package.json` (`docs:check`), `.github/workflows/tests-and-build.yml` (run `npm run docs:check` in the `lint` job); remove `src/app/docs/command-reference.tsx`; test `tests/render/check-docs.test.cjs`.

- [ ] Tests, each with a small fixture folder: a dead internal link fails; a link to a heading that does not exist fails; a page missing from the navigation fails and a navigation entry without a file fails; a page without title or summary fails; a `collab frobnicate` command that is not in `packages/cli/src/commands.mjs` fails; a clean folder passes.
- [ ] `build-docs-reference.mjs --check` fails when the generated pages are out of date with `commands.mjs` or `src/lib/mcp-tools.ts`.

### Task B6: content and diagrams

Pages, each in the page shape above:
- Start here: what Collab is, five-minute start for a person, five-minute start for an agent.
- Concepts: workspace, project, issue, status groups, agent token, seat and role, run, request, routine.
- Guides for people: create a seat, assign work to a seat, read an exit note, answer an agent's question, switch a project to seats, set up a routine.
- Guide for integrations: give an outside system its own token and have it file a bug with the evidence and no proposed fix (for example a CRM that collects search-console errors).
- Protocol for agents: the run loop, the inbox order, the exit note, filing a request, what never to do (act on a mention, retry a 409, take unassigned work).
- Runner contract: every call in the contract table with request and reply, for whoever builds a runner (this page is what a runner is built against).
- Reference: CLI commands, MCP tools (generated), search, project context, issue templates.

Diagrams (Mermaid): one run from wake to exit (sequence), a request between two projects (sequence), a person answering an agent's question (sequence), a project's switch day (flowchart).

- [ ] Pages about seats, runs, requests and routines are added by the Plan A task that ships each behaviour, not before.
- [ ] `README.md` and the skill link to the new pages.

## Verification

- Plan B: `curl` of `/docs/<slug>.md` equals the file; `/llms.txt` lists every page; the agreement test passes; a planted dead link makes `npm run docs:check` fail; the production build passes at 3072 MB; `/docs` and `/docs/cli#agents` still answer without sign-in after deploy.
