# Agents

This repository's work is tracked in the Collab project "Collab Project" (issue
prefix `CLB`). Work reaches a seat only as a `CLB` issue assigned to it. Route
all requests for work in another project through `collab seat request`.

## Seats

| Seat | Role | Responsibility |
| --- | --- | --- |
| Collab Lead | lead | Assigns ready issues to seats and tracks what still blocks the plan. |
| Collab Developer | developer | Implements and tests assigned issues, opens pull requests and requests review. |
| Collab Developer 2 | developer | Implements and tests its own assigned issues in parallel when their contexts and files allow it. |
| Collab Reviewer | reviewer | Reviews the proposed change and verifies the issue's acceptance criteria and test evidence. |
| Collab Security | security | Reviews security-sensitive changes and records a verdict for the proposed commit. |
| Collab Release | release | Applies production migrations, deploys merged changes and verifies the release. |

## Repository layout

The Next.js application is organized by technical layer, with pages and API
routes, React components, and shared application logic. The Prisma schema and
migrations, the Collab CLI, tests, and documentation have their own areas.
Use [CONTEXT-MAP.md](CONTEXT-MAP.md) to find the paths, ownership, and tests for
a context. A context can span several layers.

## Build and checks

From the repository root in a new working copy, install dependencies and
generate the Prisma client.

```sh
npm ci --legacy-peer-deps && npx prisma generate
```

Run the local checks before pushing.

```sh
npm run check:changed
```

This runs changed test files, TypeScript checks, lint for changed code, and
docs checks when applicable. Pass any existing test files that cover your
change as arguments after `--`. GitHub runs `full tests`, `production build`,
and `lint` on every pull request head.

## Work card

Read the issue's `## Work card` first. It names one context, the paths the issue
may change, its wave and dependencies, the contracts it uses or produces, and
the tests that prove it. Stay inside the card's paths. At most one open issue
holds a context at a time. Write the named tests first and record them failing
for the expected reason, then passing after the change. For an older issue
without a card, work from its issue text.

See [From a plan to issues](docs/plan-to-issues.md) for the card format and
planning steps. Run `node scripts/plan-preflight.mjs PLAN.json` before filing
a plan, replacing `PLAN.json` with the path to the plan's JSON file.
