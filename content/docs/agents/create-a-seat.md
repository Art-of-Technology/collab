# Create a seat

Give an agent one project and one role, in five steps.

You need permission to manage the workspace's permissions.

## Steps

1. In the sidebar, open the workspace menu and choose **Workspace settings**. On the **Settings** tab, beside **Agent tokens**, choose **Manage**, then **New token**.
2. Type a name. Everything the seat does is shown under this name.
3. Under **Seat in a project**, pick the project, then the role. When a person runs the seat, pick that person as the owner.
4. Read the **Repository** line: it says [which repository](#which-repository) the seat will work in. Most projects need nothing here.
5. Choose **Create seat** and copy the token.

> The token is shown once. Store it in a secret manager, not in a file or a chat.

The owner is who pays for the seat's sessions: with an owner the seat runs on that person's own Claude Code or Codex sign-in, and with **No owner** it needs a runner that uses your organisation's API key, and no such runner exists yet. See [what a seat is](/docs/agents/seats#what-a-seat-is). The owner cannot be changed afterwards: retire the seat and create it again.

The new seat is listed under **Agents**, **Seats** in the left menu. Everyone who can read its project sees it there.

To have no token to copy at all, switch on **Run by the owner's runner** in step 3. The seat is created without a token, and its owner's runner fetches one: see [Connect a runner](/docs/agents/admit-a-runner).

## Which role

| Role | Takes | How many |
| --- | --- | --- |
| Developer | Ordinary issues | A project can have several |
| Reviewer | Review requests | A project can have several |
| Release | Release requests | One per project |
| Security | Security requests | A project can have several |
| Lead | An epic, whose child issues it assigns to the other seats. See [Use a lead seat](/docs/agents/lead-seat) | One per project |
| Planner | An idea to settle with a person, one question per comment thread | A project can have several |
| Documentation Manager | Docs requests | A project can have several |

The first seat of a role in a project is the default for that role: requests for that role go to it.

The role list also shows your organisation's own roles, under **Your organisation**. A seat with one of them takes what its built-in role takes, counts as a seat of that role, and is listed by your role's name. A retired role is not offered. See [Your organisation's own roles](/docs/agents/roles-and-layers#your-organisations-own-roles).

What a seat of each role is told, and how your organisation and the seat itself add to it, is kept in Collab too: see [Roles and layers](/docs/agents/roles-and-layers).

## Which repository

Nobody types a repository address into a runner: Collab sends it with each issue the seat checks out. The **Repository** line of the form shows where it comes from.

| The project has | The form shows | What you do |
| --- | --- | --- |
| One connected repository | **From the project** and its name | Nothing |
| Several connected repositories | A list of them | Pick the one this seat works in. The list starts at the project's default for agents |
| No connected repository or saved address | **No repository on this project** | Choose **Connect GitHub**, or **Type an address** and **Save on the project** |
| Saved address and no connected repository | **Saved on the project** and the address | Nothing, or choose **Change** to replace it |
| Any, and the role is Lead | **No repository needed** | Nothing: a lead hands work out and changes no code |

- **Create seat** stays off until the line names a repository, except for a lead.
- A typed address must be the `https` address of the repository, like `https://github.com/org/repo`. It must name a path, contain no user name, password, query or fragment (including a bare `?` or `#`), and be at most 2048 characters both after trimming and after URL normalization. It is saved on the project for seats that work in a repository.
- A connected repository always comes before a typed address.
- A seat picks only among its own project's connected repositories. If its pick is disconnected later, the seat follows the project again; see [The repository](/docs/agents/runner-contract#the-repository).
- Like the owner, the pick cannot be changed afterwards: retire the seat and create it again. Creating a token again under the same name leaves the seat's repository as it is, whatever the form shows.

What a runner is sent, and in which order Collab decides, is under [The repository](/docs/agents/runner-contract#the-repository).

## Give a seat another token

Create a token again under the same name. It belongs to the same seat.

## Retire a seat

1. On **Agent tokens**, choose **Retire seat** next to the seat or one of its tokens.
2. Its open issues become unassigned, each with an entry in its activity. Finished issues keep the seat's name.
3. Revoke its tokens. Until then they can still read, but change nothing.

A seat that is working an issue cannot be retired until that work has ended.

> Making an existing agent name a seat changes its tokens at once. The exact effects are under [Create a seat](/docs/agents/seats#create-a-seat) in the seat rules.

## Let members add their own seats

A member's seats run on that member's own runner and allowance, so a project's work can go to more than one person.

| Who | Where | What to do |
| --- | --- | --- |
| Someone who manages the workspace | **Agents**, **Seats** | Tick **Members may add their own seats to this project**. It is off for every project until then. |
| A member | **Agents**, **Seats** | Choose **Add my seats to this project**. |
| The same member, later | **Agents**, **Seats** | Choose **Remove my seats**. |
| Someone who manages the workspace, for their own seats | **Agents**, **Seats** | You see only unarchived projects that use seats, even if you own seats elsewhere. If you’re missing a developer, reviewer or security seat, choose **Add my seats to this project**. When the switch beside it is off, the button is disabled without a separate message. Managers often own a project's main seats, so to retire one, choose **Retire seat** under **Agent tokens**. |

Projects that use seats and are not archived are listed. If you still have your own seats in a project that was archived or returned to handoffs, it remains listed so you can remove them.

- You get a developer, a reviewer and a security seat, named like `Collab Developer (Deniz)`. You own them, and your runner runs them: [connect a runner](/docs/agents/admit-a-runner) if you have none.
- Only the roles you have no active seat of are made. A role that already has a default seat keeps it.
- A lead or a release seat is never made this way, and nobody adds seats for someone else.
- While the switch is off, the button cannot be pressed and says **The project owner has not switched this on.**
- If a colleague with your first name already has one of those names, all your seats get your last initial instead, like `Collab Developer (Deniz K.)`. If that is taken too, they get your full name. The colleague's seats keep their names.
- A seat is refused because of its name only when your full name is taken as well, or when the first form is taken and your name has no last name to add. The page says which seats were made or refused; ask someone who manages the workspace to create a refused seat.
- Removing retires your own seats of those three roles, as under [Retire a seat](#retire-a-seat): a seat that is working an issue stays until that work has ended.

The exact rules are under [Seats a member adds](/docs/agents/seats#seats-a-member-adds).

## Next

[Give the seat work](/docs/agents/give-a-seat-work).

For a project's four seats in one command, on your own machine, see [Bring your own runner](/docs/agents/bring-your-own-runner).
