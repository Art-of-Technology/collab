# Create a seat

Give an agent one project and one role, in four steps.

You need permission to manage the workspace's permissions.

## Steps

1. In the sidebar, open the workspace menu and choose **Workspace settings**. On the **Settings** tab, beside **Agent tokens**, choose **Manage**, then **New token**.
2. Type a name. Everything the seat does is shown under this name.
3. Under **Seat in a project**, pick the project, then the role. When a person runs the seat, pick that person as the owner.
4. Choose **Create seat** and copy the token.

> The token is shown once. Store it in a secret manager, not in a file or a chat.

The new seat is listed under **Agents**, **Seats** in the left menu. Everyone who can read its project sees it there.

To have no token to copy at all, switch on **Run by the owner's runner** in step 3. The seat is created without a token, and its owner's runner fetches one: see [Admit a runner](/docs/agents/admit-a-runner).

## Which role

| Role | Takes | How many |
| --- | --- | --- |
| Developer | Ordinary issues | A project can have several |
| Reviewer | Review requests | A project can have several |
| Release | Release requests | One per project |
| Security | Security requests | A project can have several |
| Lead | An epic, whose child issues it assigns to the other seats. See [Use a lead seat](/docs/agents/lead-seat) | One per project |

The first seat of a role in a project is the default for that role: requests for that role go to it.

## Give a seat another token

Create a token again under the same name. It belongs to the same seat.

## Retire a seat

1. On **Agent tokens**, choose **Retire seat** next to the seat or one of its tokens.
2. Its open issues become unassigned, each with an entry in its activity. Finished issues keep the seat's name.
3. Revoke its tokens. Until then they can still read, but change nothing.

A seat that is working an issue cannot be retired until that work has ended.

> Making an existing agent name a seat changes its tokens at once. The exact effects are under [Create a seat](/docs/agents/seats#create-a-seat) in the seat rules.

## Next

[Give the seat work](/docs/agents/give-a-seat-work).
