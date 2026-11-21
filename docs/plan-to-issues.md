# From a plan to issues that seats build side by side

A seat starts every issue with no memory and a new working copy. What keeps two seats out of each other's way therefore has to be written on the issues. This note says how work in this repository is cut so that it is. The owner decided it on 21 November 2026; the first epic cut this way is CLB-919.

| Part | What it means here |
| --- | --- |
| Context | Every story and task names one context from [`CONTEXT-MAP.md`](../CONTEXT-MAP.md): an area of the code with its paths. At most one open issue holds a context. |
| Waves | Issues are sorted into waves. Everything in a wave can be built at the same time; nothing in a wave shares a context or a file. An issue is in a later wave than everything it needs. |
| Work card | A `## Work card` section, first in every story and task. The lead, the developer, the reviewer and security read it before anything else. |
| Tests first | The card names the tests that prove the issue. The developer writes them first and shows them fail, then pass. |
| Size | One issue is one context, one pull request and five points or less. A larger one is two issues. |
| Needs | Every "needs" on a card is also a `blocks` relation on the issues, filed from the blocking issue. |
| Sub-tasks | Not filed. The steps of a story are the tests on its card. |
| Waiting for a person | The run ends `blocked`, asking that person, with one reply word. |
| Who plans | A planning session cuts the plan and runs the pre-flight. The lead seat hands out; it does not plan. |

## The Work card

```
## Work card
- Context: <name>. May change: <paths>
- Wave: <n> of <epic key>
- Needs: <KEY> merged, because <what it uses from it> | nothing
- Consumes: <contract, as file and heading> | nothing
- Produces: <names and types later issues use> | nothing
- Shares a file with: none | <KEY>: <file>, order: <KEY> first
- Tests, written first:
  - <test file> › "<test name>" (criterion <n>)
- Security review: no | yes, because <reason>
- Person-only: no | <what>, by <who>, reply `<word>`
- Size: <points>
```

The sections the issue template requires follow the card unchanged. An issue filed before the card existed has none: seats work from its text.

## What is different in this repository

- **Release.** This project has a release seat. A developer merges, files a release request that blocks its issue, and finishes when the release is live. An epic has no release issue of its own.
- **Schema.** A schema change is its own small task that holds the `schema` context alone and gets a security review. The release seat applies the migration in a short window with the app stopped, before the pull request is merged.
- **The map.** `CONTEXT-MAP.md` covers the whole repository in wide rows. A plan splits a row, or adds a narrow one, when it first needs to.

## The steps

1. The plan names the contexts it touches and adds any that are missing to `CONTEXT-MAP.md`.
2. Every hand-over between two contexts is written down: what crosses, where it is written, the test that pins it.
3. The work is cut into issues of one context each, in waves. What unblocks the rest goes first.
4. The pre-flight checks the cut before anything is filed: every issue has a card and names a test, no two issues of a wave share a context or a file, every need has a block and every block a need, and "Starts now" is the set of issues that need nothing unfinished.
5. The owner sees the waves on one page and answers `file ok`.
6. The epic is filed with its children and assigned to the lead seat last.

## Not decided yet

- The workspace's issue templates do not ask for a Work card. That changes only after one epic has worked this way.
- Nothing checks that a pull request stays inside its card's paths except the reviewer.
