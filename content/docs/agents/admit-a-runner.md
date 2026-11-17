# Admit a runner

Let a runner fetch the tokens of your seats by itself, so nobody copies a token.

A runner is the program that works seats on one machine, under one person's logins. You admit it once. After that it asks Collab which seats are its to run and gets a token for each.

| Step | Who | Where |
| --- | --- | --- |
| 1. Create the seat for a runner | Someone who manages the workspace | **Agent tokens**, **New token** |
| 2. Start the pairing | The runner | On the runner's machine: it shows a code |
| 3. Type the code | The person whose runner it is | **Agents**, **Runners** |

## Steps

1. Create the seat as on [Create a seat](/docs/agents/create-a-seat), pick its owner, and switch on **Run by the owner's runner**. No token is made, and none is shown.
2. Start the pairing on the runner's machine. The runner shows a code such as `K7QF-M2XD`.
3. In the left menu, open **Agents**, then the **Runners** tab. Type the code and choose **Admit**.

> Only type a code your own runner shows you. Whoever shows the code gets the tokens of your seats.

The runner gets its seats the next time it asks. A code works once, for 15 minutes.

## Who may do what

| Action | A member | The workspace's owner |
| --- | --- | --- |
| Admit a runner for yourself | Yes | Yes |
| Admit a runner for someone else | No | Yes |
| Remove your own runner | Yes | Yes |
| Remove anyone's runner | No | Yes |

An agent token cannot admit or remove a runner. It takes a signed-in person.

## Which seats a runner gets

A runner gets a seat when all of this is true:

- The seat was created with **Run by the owner's runner**.
- The seat's owner is the person the runner was admitted for.
- The seat is in the workspace the runner was admitted to, and is not retired.

A seat run by hand keeps its hand-made token. A runner never gets it.

## See whether a seat has a runner

- **Agents**, **Seats** marks a seat with **No runner yet** until a runner holds its token, and with **Token expired** when the last token a runner fetched for it has run out.
- The project's **Settings**, **Agents** lists each of these seats with the runner that fetched its token, when, when the token runs out, and when the seat last asked for work. **Renewal not picked up** means a new token was handed over and the runner has not used it yet; the old one still works.
- A request to a seat with no usable token still succeeds, with the warning `seat_idle` and a comment that says so.

## Renewal and the end of a token

A fetched token lasts 30 days, and nobody has to remember it:

- In its last week, the runner's next ask is answered with a new token for that seat as well. The old one keeps working until the runner uses the new one, so the seat is never without a valid token.
- If the runner never uses the new one, nothing stops: the old token works to its own expiry, and the seat shows **Renewal not picked up**.
- A runner that is away for the whole week leaves a token that runs out. The seat shows it, its work waits, and the next ask gets it a new token.
- A seat run by hand is not renewed by this. Its token keeps the expiry it was made with.

**Renew tokens** under **Agents**, **Runners** revokes everything that runner fetched at once, for when a token may have leaked. The runner fetches new tokens on its next ask, about a minute later, and the seats' work waits until then. Nothing has to be made again by hand.

A fetched token is also revoked at once when:

- the seat is retired, or its project is archived (an archived project's seats are not fetched at all);
- the runner is removed or replaced;
- the runner says goodbye, which is what a runner does as its last act when its machine is deleted on purpose.

## Good to know

- A person has one runner per workspace. Admitting another removes the one before and revokes the tokens it fetched. This is how a rebuilt machine replaces a lost one.
- Removing a runner stops its credential and revokes every token it fetched, at once.
- A runner whose person is no longer in the workspace gets nothing.
- Nobody can make a token by hand for a seat that a runner runs.
- A runner is admitted, renewed and removed from Collab's own page only. A request from another site is refused.

## Stop a seat that a runner runs

| To stop | Do this | To start it again |
| --- | --- | --- |
| One seat | Under **Agent tokens**, revoke every token of the seat. Its agent is switched off, and the runner gets no new token. | Someone who manages the workspace creates the seat again: same name, project and role, with **Run by the owner's runner**. |
| One seat, for good | Retire the seat. | Create a new seat. |
| Every seat of a project | Archive the project. | Bring the project back; the runner fetches its seats again. |
| Every seat of a runner | Remove the runner under **Agents**, **Runners**. | Admit a runner again. |

- A runner never switches an agent back on. When someone switched a seat's agent off or removed it from the workspace, the runner gets no token for it until a person creates the seat again.
- Retiring a seat revokes the tokens its runner fetched for it. A token made by hand stays until you revoke it: it can read but change nothing.

## Next

The two calls a runner makes are under [A runner fetches its seats](/docs/agents/runner-contract#a-runner-fetches-its-seats).
