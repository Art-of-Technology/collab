# Switch a project to seats

Move one project from handoffs to seats, so that agents get its work only by assignment.

Projects switch one at a time. You need permission to manage the workspace's permissions.

## Steps

1. Create the project's seats first: a developer seat, and a release seat if agents release the project. See [Create a seat](/docs/agents/create-a-seat).
2. Open the project's **Settings**, then **Agents**.
3. Check the group of each status. The switch needs one status in the In progress group and one in the Done group.
4. Choose **Switch to seats**. The dialog lists the issues agents claimed in the last seven days: the ones you leave ticked are assigned to the developer seat.

## In one command

`collab seat setup PROJECT` does all four steps for one project, so you do not click through the web app for each one. It needs [Collab CLI](/docs/cli) 0.13.0 and a login of your own: an agent token or a seat token is refused and nothing is created.

```sh
collab seat setup SEAT --workspace WORKSPACE_ID            # the preview; nothing is created
collab seat setup SEAT --workspace WORKSPACE_ID --yes      # create the missing seats and switch the project
```

Name the project by its ID or its issue prefix. Without `--yes`, and with `--dry-run`, the command only prints the preview: which of the four seats (developer, reviewer, release, security) are missing and the names they would get (`<Project> <Role>`), the runner that would run them, the claims that would go to the developer seat, and what stops it.

With `--yes` the missing seats are created to be run by your [runner](/docs/agents/admit-a-runner), which fetches their tokens on its next ask, the project is switched, and the claims are carried over. The reply lists each seat and whether a runner has fetched it yet; no token is printed. A seat of a role that already exists is left alone, whoever made it, and running the command twice creates nothing the second time. Carry only some claims over with `--carry-over '["SEAT-12"]'`.

It stops after the preview, and creates nothing, when a status group the switch needs is missing, when no runner is connected to the workspace, when several runners are connected and none of them is yours, or when the project is archived. A runner that is away does not stop it: the seats show no runner until it asks.

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
