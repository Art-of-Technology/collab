# Bring your own runner

Give a project its four seats on your own machine, under your own agent sign-in, with a prompt you paste into your coding agent.

A runner is the program that works seats on one machine, under one person's logins. You connect yours once; after that `collab seat setup` gives a project the seats it is missing and switches it, in one command. The prompt below has your agent do that part, and stop wherever only a person can act.

Setting the machine up — its image, enrolling it, signing your coding agent in — belongs to the runner's own documentation. Any runner that speaks the [runner contract](/docs/agents/runner-contract) can be used, Stech's seat runner among them.

| Step | Who | Where |
| --- | --- | --- |
| 1. Install the CLI and sign in | You | The machine that runs the seats: [Collab CLI](/docs/cli) |
| 2. Start the pairing | Your runner | The same machine: it shows a code |
| 3. Type the code | You | **Agents**, **Runners** |
| 4. Read the preview | Your agent | `collab seat setup PREFIX` |
| 5. Create the four seats | Your agent, once you say yes | `collab seat setup PREFIX --yes` |
| 6. Give a seat its first issue | You | The issue's **Assignee** |

## Steps

1. Install [Collab CLI](/docs/cli) 0.13.0 or newer on that machine and sign in as yourself: `collab auth login --url https://collab.example.com`. The setup command needs a person's login, and that person needs permission to manage the workspace's permissions: an agent token or a seat token is refused with `person_required`, a member without that permission with `forbidden`. Ask a workspace admin for it.
2. Start the pairing on the same machine. The runner shows a code such as `K7QF-M2XD`.
3. In the left menu, open **Agents**, then the **Runners** tab. Type the code and choose **Connect**. Only type a code your own runner shows you: see [Connect a runner](/docs/agents/admit-a-runner).
4. Read the preview for the project, named by its issue prefix: `collab seat setup MCN`. Nothing is created. It says which of the four seats are missing and the names they would get, the runner that would run them, the claims that would go to the developer seat, and what stops it. Check the runner it names: it is yours, unless you have none of your own and exactly one runner is connected to the workspace, when that one is named instead — and the seats would then belong to whoever owns it, not to you.
5. Create them: `collab seat setup MCN --yes`. The missing seats are made to be run by that runner and to belong to its owner, and it fetches their tokens on its next ask, so no token is made here and none is shown. The project is switched to seats and the claims are carried over. The reply lists each seat with whether a runner has fetched its token yet.
6. Assign the first issue to the developer seat, as on [Give a seat work](/docs/agents/give-a-seat-work). Your runner picks it up on its next ask.

## The prompt

Paste this into a fresh session of your coding agent, on the machine that runs your seats, after step 3. Put the project's issue prefix where it says so. It does steps 4 and 5 and stops at everything else.

```text
Set one Collab project up with its own seats, using Collab CLI 0.13.0 on this
machine. The project's issue prefix is: <PREFIX>

Rules for the whole task:
- Stop at the first command that fails. Show me its output and wait. Do not try
  another way round it.
- Never print, copy or store a token. None of these commands prints one. If any
  output ever carries one, stop and tell me.
- The steps marked "mine" are a person's. Never attempt them, and never ask for
  a password or a pairing code.

1. Run `collab whoami`. It must answer with me, a person. If it fails, or it
   answers with an agent or a seat, stop: signing in is mine
   (`collab auth login --url <the Collab server>`), and the setup command
   refuses an agent token or a seat token.
2. Run `collab projects list` and find the project with that issue prefix. Tell
   me its name and its ID. If it is not there, stop and show me
   `collab workspaces list`: picking the workspace is mine
   (`collab config set --workspace <ID>`).
3. Run `collab seat setup <PREFIX>`. This is the preview; it creates nothing.
   Show me all of it: which of the four seats (developer, reviewer, release,
   security) are missing and the names they would get, the runner that would run
   them, and the claims that would be carried over to the developer seat.
   If it fails with person_required or forbidden, stop: that is my sign-in, or
   my permission to manage the workspace's permissions, which a workspace admin
   grants me. Neither is yours to fix.
4. Look at the runner the preview names. If it is not mine, stop and tell me
   whose it is: the new seats would be run by that runner and belong to its
   owner, not to me. Connecting my own runner is mine.
5. If the preview is blocked, stop and tell me the reason. Each one is mine:
   - no_runner, runner_choice: I start the pairing on this machine and type the
     code it shows under Agents, Runners.
   - status_groups: I give the project a status in the In progress group and one
     in the Done group.
   - project_archived: I bring the project back.
   Wait until I say it is fixed, then go back to step 3.
6. Ask me whether to create what the preview listed, and wait for my answer.
   Only if I say yes, run `collab seat setup <PREFIX> --yes`. Show me the seats
   it created, the issues it carried over, and which seats the runner has not
   fetched a token for yet; that is normal until its next ask.
7. Run `collab seat setup <PREFIX>` once more and show it to me. All four seats
   must now exist and the project must be on seats. The preview does not carry
   the token state; the reply in step 6 is where that was.
8. Stop there. Giving a seat its first issue is mine, under Assignee on the
   issue.
```

## What the command does not do yet

- Four roles only: developer, reviewer, release and security. A [lead seat](/docs/agents/lead-seat), and a seat you run by hand with its own token, are made in the web app: see [Create a seat](/docs/agents/create-a-seat).
- One project per call. Run it again, with the next prefix, for the next project.

Every rule the command follows is under [Set a project up in one command](/docs/agents/seats#set-a-project-up-in-one-command).

## Next

[Give a seat work](/docs/agents/give-a-seat-work), then leave the runner to it.
