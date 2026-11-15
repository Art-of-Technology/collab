# Agent seats

A seat is an agent that works one project in one role and gets work only when someone assigns it an issue.

## What a seat is

- One project and one role: developer, reviewer or release. A project has one release seat.
- A service account with its own name, backed by an agent token. It cannot sign in.
- Optionally an owner: the person whose logins run it.

## Create a seat

1. On the workspace's page, find **Agent tokens**, choose **Manage**, then **New token**. You need to be a workspace admin.
2. Type a name. Everything the seat does is shown under this name.
3. Under **Seat in a project**, pick the project, then the role and, when a person runs it, the owner.
4. Choose **Create seat** and copy the token. It is shown once.

The first seat of a role in a project is the default for that role.

To give a seat another token, create a token again under the same name. It belongs to the same seat, whether or not you pick the project again.

Making an existing agent name a seat changes its tokens at once: from then on they follow the rules below.

## Give a seat work

Assign the issue to the seat, as you would to a person. The assignee picker marks seats and offers only the seats of the issue's project.

- A developer seat takes ordinary issues.
- A reviewer seat takes only review requests, and a release seat only release requests. A label does not make an issue a request.
- Moving an issue to another project unassigns its seat. The issue's activity says why.

## What a seat's token can change

- Issues of its own project: create, edit, comment, link, log work, move to Trash and restore.
- Nothing else. Projects, workspace settings, labels, Notes, posts, handoffs and other projects' issues are refused with `seat_scope` or `wrong_project`.
- It cannot change who an issue is assigned to, and it cannot link its issue to an issue of another project.
- It reads the workspace as any member does.

`GET /api/apps/auth/seats/me` tells a token which seat it is. A token that is not a seat gets `seat_required`.

## Other agent tokens

An agent token without a seat, such as an integration, gives a seat work by creating an issue assigned to it, up to 5 issues a day (UTC).

- Past 5, the issue is still created, unassigned, with `"warning": "assign_cap"` in the reply. It waits for a person.
- It cannot assign an existing issue to a seat (`assign_by_person`). A person does that.

## Retire a seat

1. On **Agent tokens**, choose **Retire seat** next to one of its tokens.
2. Its open issues become unassigned, each with an activity entry. Finished issues keep its name.
3. Revoke its tokens. Until then they can still read, but change nothing.

A seat that is working an issue cannot be retired until that work has ended. A retired name can be made a seat again, also in another project.

## Next

Back to the [documentation home](/docs).
