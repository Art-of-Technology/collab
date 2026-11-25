# Docs lane and docs site

Design note. The repository's owner asked for it on 25 November 2026 and is the person waiting for it. Nothing here is built yet.

| The change is | Today | Slice 1: short lane | Slice 2: docs site |
| --- | --- | --- | --- |
| A design note under `docs/` | full CI, 6 to 11 min | docs check only | docs check only |
| A help page under `content/docs/` | full PR checks, then an app release build and restart | docs check on the PR, then an app release build and restart | docs check on the PR, then the site publishes without an app release build or restart |
| App code | full CI, app build and restart | as today | as today |

## The problem

Every pull request runs the whole of `.github/workflows/tests-and-build.yml`: type check, both test suites, browser tests, lint and the production build. A change to a Markdown file pays for all of it. The help pages are files inside the app's image, so changing one also means building and restarting the app.

Measured on 25 November 2026: the workflow took 6 to 11 minutes on each of its last 30 runs. Six of the last 60 merged pull requests changed only documents, and five of those were design notes. A release took 13 minutes at the median between 17 and 21 November.

## The three lines

- **Who is waiting:** the repository's owner.
- **First day:** he changes a help page and sees it live at the app's existing `/docs` address in under 5 minutes, with no app restart.
- **Smallest version:** today's 25 help pages, with the same look and the same addresses, published on merge. No new features.

## What exists today

Checked against commit `26b8bf6c1` of `main`.

- `tests-and-build.yml` runs on every pull request and every push to `main`, with no path filter. Its jobs are `full tests`, `lint` and `production build`. `npm run docs:check` is a step of `lint`: dead links and headings, pages missing from the menu, `collab` commands that do not exist, and the two generated reference pages.
- The docs check follows links in the help pages. The production build fetches `/docs/cli` from the locally built app and checks five heading IDs used by public links, including the app's “Explore the workflow” link.
- The help pages are 25 Markdown files and `nav.json` in `content/docs`. `src/lib/docs.ts` reads them from disk at run time, and `next.config.js` copies the folder into the standalone output.
- People read the pages at `/docs` (`src/app/docs`). The search box on every help page fetches `/docs-index.json` when first opened. Agents use that index too, along with `/llms.txt`, `/llms-full.txt`, the raw Markdown addresses and the docs tools of the MCP server.
- Two reference pages are generated from the code (`npm run docs:reference`).
- CLB-1008, in progress, stops a release for a merge that changes no app code. Its list of paths is its own: it counts tests and repository scripts as "not the app", which must still run every check here, and until the site is live a help page is app code for it, because the app is what publishes the page. Two Markdown files under `public/docs/` are served by the app and stay app code for a release.

## Decisions

The owner decided these on 25 November 2026.

1. **A docs-only pull request runs the docs check and nothing else.** Docs-only means every changed file is under `docs/` or `content/docs/`, or is a Markdown file outside `src/`, `packages/`, `prisma/`, `scripts/` and `tests/`. This list decides one thing: which checks a pull request runs. It does not decide what is released. A push to `main` runs everything, unchanged, because the release waits for `full tests` and `production build` to have passed there.
2. **The three checks keep their names and still report.** On a docs-only pull request `full tests` and `production build` finish as skipped, and `lint` runs with the docs check as its only step, so a broken link or a stale reference page still fails `lint`. The docs check also fails if the candidate CLI page loses any of its five public heading IDs (`installation`, `authentication`, `workflow`, `agents` and `commands`). Whoever merges holds a docs-only pull request to a green `lint`, as today. A change that touches one file outside the list runs everything.
3. **A docs-only pull request needs no Octopus score.** The docs check is its gate. Slice 1 also writes this exception where the rule "4 of 5 before a merge" is written for the seats and sessions that merge.
4. **The help pages move to a static site,** built from `content/docs` in this repository and published on every merge that changes it. Before publishing, check the public page addresses, the five CLI heading IDs and the search index against the candidate static output. Publish those checked pages and their index together on Cloudflare Pages. The site's search box uses that build's index so each result opens a heading in the published pages.
5. **The address stays the app's existing `/docs`.** The app fetches each help page from the site and returns it. It sends the site no cookie and no header that identifies the reader: a plain rewrite would forward the reader's session cookie and identity headers to another host, so this is a route in the app, not a line in `next.config.js`. No DNS record and no ingress rule changes.
   In the production-build smoke check, serve the same commit's static build locally and point the built app's help route at it. A mixed app-and-help pull request and a push to `main` then exercise the app route with the candidate pages. The smoke check still reads the agent endpoints from the built app.
6. **Same repository.** The reference pages stay generated from the code and checked against the real commands.
7. **Agents keep reading the app's copy** through `/llms.txt`, `/llms-full.txt`, `/docs-index.json`, the raw Markdown addresses and the MCP docs tools. These update with the next app release.

## The cut

The short lane is one pull request by the session that looks after CI. The site is the second slice and starts when the lane is live and used once.

| Slice | What | Needs |
| --- | --- | --- |
| 1 | Add the five public CLI heading IDs to the docs check before enabling the short PR lane in `tests-and-build.yml`. Record the Octopus exception (decisions 1 to 3). | nothing |
| 2 | Check and publish the static pages and their index. Exercise the app route against the local static build in CI. When the route serves Pages, the session responsible for CLB-1008 enables the release skip for help-only merges (decisions 4 to 7). | Slice 1 used once, a Pages project and publish token from the owner, and CLB-1008's release rule in operation before cutover. Until the route is live, help changes still require an app release. |

## Costs the owner accepted

- The help pages load through the app. When the app is down they are down, as today.
- A second thing to host. When it is down, `/docs` fails while the rest of the app works.
- After a Pages publish, people can search for a renamed heading immediately. Agents can see the old heading in the app's index until the next app release.

## Not in this work

- New docs features, a new look or new addresses.
- Pointing the agents' docs tools at the site.
- The design notes under `docs/`: they are not published anywhere.

## Not checked

- How long the docs check takes alone in CI. Locally it takes about 2 seconds; installing dependencies is most of a CI job.
- Whether the app's response headers allow a page that it fetched from another host.
- The developer decides how to keep the look of today's pages and records the choice in the pull request. If the site reuses `src/components/docs/DocsSearch.tsx`, it must load the index from the same Pages build as the page.
