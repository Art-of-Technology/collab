# Seats by room: the approved screens

The screens the owner approved on 19 November 2026 for the epic CLB-773, "Seats by room: work goes to the seat with allowance left". Build to these. Where a story and a screen disagree, ask before building.

All names and numbers in the pictures are sample data. `mockup.html` in this folder is the clickable page the pictures were taken from; open it in a browser to try each control.

## What "room" is

One figure per seat: the percent of allowance left, against the runner's hold-back, on the program that seat would run next. It is shown as room left ("60% room"), never as percent used.

| Shown as | When |
| --- | --- |
| A bar and "60% room · next run on Claude Code" | The runner reported a figure in the last 15 minutes |
| "no room" with the reason | The runner is offline, paused, has a full disk, or the allowance is used up |
| "unknown" with the reason | No figure, or one older than 15 minutes. Work is then placed as it was before this epic |

## How it works

![The lead, Collab and two runners](01-how-it-works.png)

Each runner reports room to Collab. Collab hands the lead the developer seats with the most room first, and places review, security and release requests itself by the same rule.

## Agents page (CLB-775, CLB-776)

Approved layout: **grouped by person**. One card per person with the runner's name, one room bar and that person's seats as role chips. The default seat of a role is marked.

The screenshot below shows the switch after the owner has enabled it.

![Agents page grouped by person](02-agents-by-person.png)

The owner's switch "Members may add their own seats to this project" is off by default. After the owner enables it, a member without seats sees one button:

![A member before adding seats](03-agents-member-before-adding.png)

Pressing it creates a developer, a reviewer and a security seat named like "Collab Developer (Deniz)". The member can remove their own seats.

![A member after adding seats](04-agents-member-after-adding.png)

Who sees the numbers: the workspace owner and the lead see everyone's; a member sees their own.

## The lead's turn (CLB-777)

The lead stays the only assigner. It is given the developer seats ordered by room; equal room goes to the person with the fewest open runs; a seat with no room gets nothing. The lead's comment says why a seat was chosen.

![Seats ordered for the lead](05-lead-order.png)

The "Try it" box belongs to the mockup, not to the product.

## Requests (CLB-778)

Collab places a request on the seat of the role with the most room and says which seat got it and why. Without a fresh figure it goes to the default seat, as before.

![Requests placed by room](06-requests.png)

## Whose allowance (CLB-779)

Approved layout: **on the issue, beside each run**. A chip names the owner and the program. Every project member sees it; no percentage is shown here.

![A run shows whose allowance it used](07-run-allowance.png)

## When a runner is full (CLB-780)

Work that no run has started on moves after its seat has had no room for 10 minutes. Collab moves a request by itself:

![Collab moves the request](08-full-collab-moves-request.png)

The lead is woken for a developer story, moves it and writes one comment. Work that has started keeps its seat and waits:

![The lead moves the story](09-full-lead-moves-story.png)

When the first runner has room again, moved work stays where it went:

![After the reset](10-full-after-reset.png)

## Decided and left out

- A seat keeps one owner and one runner. No seat is shared between runners.
- One lead per project.
- Not in this version: a per-person reserve, a rule that keeps a person's reviewer seat away from that person's own work, and a Runs list with an allowance column.
