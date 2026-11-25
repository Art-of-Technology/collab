# Docs lane and docs site

Design note. The repository's owner asked for it on 25 November 2026 and is the person waiting for it. Nothing here is built yet.

| The change is | Today | Slice 1: short lane | Slice 2: docs site |
| --- | --- | --- | --- |
| A design note under `docs/` | full CI, 7 to 11 min | docs check only | docs check only |
| A help page under `content/docs/` | full CI, then an app build and restart | docs check, then an app build and restart | docs check, then the site publishes; the app is not built or restarted |
| App code | full CI, app build and restart | as today | as today |

## The problem

Every pull request runs the whole of `.github/workflows/tests-and-build.yml`: type check, both test suites, browser tests, lint and the production build. A change to a Markdown file pays for all of it. The help pages are files inside the app's image, so changing one also means building and restarting the app.

Measured on 25 November 2026: the workflow took 6 to 11 minutes on each of its last 30 runs. Six of the last 60 merged pull requests changed only documents, and five of those were design notes. A release took 13 minutes at the median between 17 and 21 November.

## The three lines

- **Who is waiting:** the repository's owner.
- **First day:** he changes a help page and sees it live at `collab.weez.boo/docs` in under 5 minutes, with no app restart.
- **Smallest version:** today's 25 help pages, with the same look and the same addresses, published on merge. No new features.

## What exists today

Checked against commit `26b8bf6c1` of `main`.

- `tests-and-build.yml` runs on every pull request and every push to `main`, with no path filter. Its jobs are `full tests`, `lint` and `production build`. `npm run docs:check` is a step of `lint`: dead links and headings, pages missing from the menu, `collab` commands that do not exist, and the two generated reference pages.
- The help pages are 25 Markdown files and `nav.json` in `content/docs`. `src/lib/docs.ts` reads them from disk at run time, and `next.config.js` copies the folder into the standalone output.
- People read them at `/docs` (`src/app/docs`). Agents read the same files through `/llms.txt`, `/llms-full.txt`, `/docs-index.json`, the raw Markdown addresses and the docs tools of the MCP server.
- Two reference pages are generated from the code (`npm run docs:reference`).
- CLB-1008, in progress, stops a release for a merge that changes no app code.

## Decisions

The owner decided these on 25 November 2026.

1. **A docs-only pull request runs the docs check and nothing else.** Docs-only means every changed file is under `docs/` or `content/docs/`, or is a Markdown file outside `src/`, `packages/`, `prisma/`, `scripts/` and `tests/`. The list is the same one CLB-1008 uses for "not the app"; whichever lands first writes it and the other reads it.
2. **The three checks keep their names and still report.** `full tests`, `production build` and `lint` finish as skipped on a docs-only change, so a rule that waits for them is not left waiting. A change that touches one file outside the list runs everything, as today.
3. **A docs-only pull request needs no Octopus score.** The docs check is its gate.
4. **The help pages move to a static site,** built from `content/docs` in this repository and published on every merge that changes it. It is hosted on Cloudflare Pages.
5. **The address stays `collab.weez.boo/docs`.** The app passes requests for the help pages through to the site (a rewrite in `next.config.js`). No DNS record and no ingress rule changes.
6. **Same repository.** The reference pages stay generated from the code and checked against the real commands.
7. **Agents keep reading the app's copy** (`/llms.txt`, the index, the raw Markdown, the MCP docs tools). After a help page changes, an agent can see the old text until the next app release. Accepted for now.

## The cut

The short lane is one pull request by the session that looks after CI. The site is the second slice and starts when the lane is live and used once.

| Slice | What | Needs |
| --- | --- | --- |
| 1 | The short lane in `tests-and-build.yml` (decisions 1 to 3) | nothing |
| 2 | The static build of the help pages, its publish step, and the rewrite (decisions 4 to 7) | slice 1; a Pages project and a publish token, which only the owner can create |

## Costs the owner accepted

- The help pages load through the app. When the app is down they are down, as today.
- A second thing to host. When it is down, `/docs` fails while the rest of the app works.
- Agents can lag people by one app release (decision 7).

## Not in this work

- New docs features, a new look or new addresses.
- Pointing the agents' docs tools at the site.
- The design notes under `docs/`: they are not published anywhere.

## Not checked

- How long the docs check takes alone in CI. Locally it takes about 2 seconds; installing dependencies is most of a CI job.
- Whether the app's response headers allow a page that is passed through from another host.
- How the static build keeps the look of today's pages: by reusing `src/components/docs`, or by another route. The developer decides and says so in the pull request.
