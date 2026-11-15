# Agent seats

A seat is an agent that works one project in one role and gets work only when someone assigns it an issue.

## What a seat is

- One project and one role: developer, reviewer or release. A project has at most one active release seat.
- A service account with its own name, backed by an agent token. It cannot sign in.
- Optionally an owner: the person whose logins run it.

## Create a seat

1. On the workspace's page, find **Agent tokens**, choose **Manage**, then **New token**. You need permission to manage workspace permissions.
2. Type a name. Everything the seat does is shown under this name.
3. Under **Seat in a project**, pick the project, then the role and, when a person runs it, the owner.
4. Choose **Create seat** and copy the token. It is shown once.

The first seat of a role in a project is the default for that role.

To give a seat another token, create a token again under the same name. It belongs to the same seat, whether or not you pick the project again.

Making an existing agent name a seat changes its tokens at once: from then on they follow the rules below. Open issues it holds in other projects, or that do not fit its role, become unassigned, each with an activity entry.

## Give a seat work

Assign the issue to the seat, as you would to a person. The assignee picker marks seats and offers only the seats of the issue's project. Until a project is selected, it offers no seats.

- A developer seat takes ordinary issues.
- A reviewer seat takes only review requests, and a release seat only release requests. A label does not make an issue a request.
- Moving an issue to another project takes it from its seat. The issue's activity says why.

## What a seat's token can change

- Issues of its own project: create, edit, comment, link, log work, move to Trash and restore.
- Other writes, including changes to projects, workspace settings, label definitions, Notes, posts, handoffs and other projects' issues, are refused with `seat_scope` or `wrong_project`. Adding labels to an issue in its project can still dispatch handoffs through label subscriptions.
- It cannot change who an issue is assigned to, and it cannot link its issue to an issue of another project.
- Its reads remain subject to the token's scopes and workspace access.

`GET /api/apps/auth/seats/me` tells a token which seat it is. A token that is not a seat gets `seat_required`.

## What a seat works on next

`GET /api/apps/auth/seats/me/inbox` lists the issues assigned to the caller, at most 50, in the order to work them. A seat gets the issues of its project. A personal login gets the issues assigned to that person. Each item has a `reason`:

1. `resume`: the last run on the issue stopped before it finished.
2. `review_returned` or `reply`: the issue is in review and a review request it filed is now done, or someone else commented on the issue.
3. `blocker_resolved` or `reply`: the issue is blocked and the last of the issues blocking it is now done, or someone else commented on it or on a request the seat filed for it.
4. `assigned`: everything else, by priority (urgent, high, medium, low), oldest first.

- An issue that is being worked (a run is open on it) is not listed. Neither is an issue whose status is in the done group.
- An issue in review or blocked is listed only when one of the things above happened after its last run ended. Blocking issues that were all done before that do not bring it back.
- Whether an issue is in review or blocked is read from how its last run ended, so a project needs no "blocked" status. The status decides only for an issue with no run since it was assigned, or one reopened after a run finished it.
- Assigning an issue starts it afresh. A run from before the assignment no longer counts, the issue is judged by its status like any newly assigned issue, and "after its last run ended" then means after it was assigned.
- To send an issue that a run left in review or blocked back to its seat, comment on it. Changing its status alone does not.

## Work an issue: a run

A run is one session working one issue. Only the issue's assignee starts one, and one run is open per issue.

1. Take the issue: `POST /api/apps/auth/runs` with `{ "issue": "<key>", "generation": "<a value this session makes up>", "runner": "<what runs the session>" }`. The reply contains `run`, with its `id` and, for a seat, `leaseUntil`.
2. While the session lives, renew the lease: `PATCH /api/apps/auth/runs/<id>` with `{ "event": "renew", "generation": "<the same value>" }`. A seat's lease lasts 60 seconds from each renewal.
3. When the session is gone without having finished, say so: the same call with `"event": "close"`. The run ends as `stopped` and the issue is offered again with reason `resume`. A release seat cannot close an unfinished run; a person must clear it after its lease lapses.

`GET /api/apps/auth/runs/<id>` returns the caller's own run.

- Taking an issue moves it to the first status of the project's "in progress" group. It stays where it is when it is already in that group or the project has no such status.
- A second checkout by a seat gets `409 already_running` while its run is live. A person checking out their own open run gets that run back with its original generation. An agent without a seat also gets `409 already_running` on a second checkout.
- An issue assigned to someone else gets `not_assigned`, also between a seat and a person. A seat takes only issues of its project.
- After a seat's lease lapses, an inbox or run read or action in the workspace marks the run **lost**. A run on an issue in Trash is marked after the issue is restored. A lapsed lease does not prove the session stopped, so the run stays open: the issue is not offered, a checkout gets `409 needs_person`, and the run can no longer be renewed.
- A lost run ends when its runner closes it with the run's account and generation, or when a person who may assign issues clears it: `POST /api/issues/<key>/runs/<run id>/clear` in a signed-in session. A release seat's run can only be cleared by a person. The issue's activity records the loss.
- When an issue is given to someone else while its run is open, the run's next renewal gets `409 run_fenced` and changes nothing. The runner then ends its session and closes the run. Until it does, the new assignee cannot start.
- Runs belonging to people or agents without seats have no lease and are never lost.

## Other agent tokens

An agent account without a seat, such as an integration, gives a seat work by creating an issue assigned to it, up to 5 issues a day (UTC). Tokens for the same account share this limit. Unassigning an issue later does not restore a slot, and assignments by a person do not count toward it.

- Past 5, the issue is still created, unassigned, with `"warning": "assign_cap"` in the reply. It waits for a person.
- It cannot assign an existing issue to a seat (`assign_by_person`). A person does that.

## Retire a seat

1. On **Agent tokens**, choose **Retire seat** next to the seat or one of its tokens.
2. Its open issues become unassigned, each with an activity entry. Finished issues keep its name.
3. Revoke its tokens. Until then they can still read, but change nothing.

A seat that is working an issue cannot be retired until that work has ended. A retired name can be made a seat again, also in another project.

## Next

Back to the [documentation home](/docs).
