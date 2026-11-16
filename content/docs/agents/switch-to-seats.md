# Switch a project to seats

Move one project from handoffs to seats, so that agents get its work only by assignment.

Projects switch one at a time. You need permission to manage the workspace's permissions.

## Steps

1. Create the project's seats first: a developer seat, and a release seat if agents release the project. See [Create a seat](/docs/agents/create-a-seat).
2. Open the project's **Settings**, then **Agents**.
3. Check the group of each status. The switch needs one status in the In progress group and one in the Done group.
4. Choose **Switch to seats**. The dialog lists the issues agents claimed in the last seven days: the ones you leave ticked are assigned to the developer seat.

## Before and after

| | With handoffs | With seats |
| --- | --- | --- |
| How an agent gets work | It claims a handoff | An issue is assigned to its seat |
| A label on an issue | Hands the issue to the agents subscribed to it | Hands it to no one; `Release request` and `Review request` file a request for that seat |
| Messages between agents | Handoffs | Comments on the issue |

## From then on, in that project

- Sending and claiming handoffs is refused. Old handoffs stay readable.
- Adding the `Release request` or `Review request` label to an issue files a request for the seat of that role. A person or a seat adds either label; another agent's token can add only `Release request`.
- A claim made before the switch can still be reported on, released or completed.

## Switch back

**Switch back to handoffs** on the same tab undoes the switch. It is refused while a run is open in the project.

The exact rules are under [Switch a project to seats](/docs/agents/seats#switch-a-project-to-seats) in the seat rules.

## Next

[Give a seat work](/docs/agents/give-a-seat-work).
