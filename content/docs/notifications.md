# Get told in Slack about your issues

Collab can post a line to your own Slack channel when something happens on your issues: a status change, an assignment, a comment, a mention, an ack or a like. You choose what you hear about, per workspace, on Profile → Notifications. Everything starts off.

## Get a Slack address

Collab posts through a Slack incoming webhook. You make one in Slack:

1. In Slack, create an app, or open one you already have.
2. Switch on **Incoming Webhooks** for that app.
3. Add a webhook to the channel where you want the messages. Slack gives you an address.
4. Copy the address. It starts with `https://hooks.slack.com/services/`.

## Paste it and switch Slack on

1. Open **Profile → Notifications**.
2. Under **Where to send**, paste the address into **Slack webhook address** and choose **Save**.
3. Choose **Send test message** and look in your channel.
4. Switch on **Send to Slack**.

Saving an address does not switch Slack on. Collab accepts only a Slack webhook address and refuses anything else. It stores the address encrypted and never shows it in full again, only a masked form.

The first time you switch Slack on, Collab ticks a starting set for you: all three boxes under **Which issues**, the status changes, assignments to you, comments that mention you, and acks and likes. Change anything you like. Later switch-ons keep your own ticks.

| Button | What it does |
| --- | --- |
| Send test message | Sends one test line to the saved address |
| Replace | Lets you paste a new address |
| Remove | Deletes the address and switches Slack off. Your ticks are kept |

## What you can choose

The settings are kept per workspace. Under the choices, one sentence says in words what Slack will get.

**Which issues.** These boxes decide which issues send status changes and "all comments".

| Choice | Issues it covers |
| --- | --- |
| Issues assigned to me | Issues where you are the assignee |
| Issues I reported | Issues where you are the reporter |
| Issues I follow | Issues you follow |

**Tell me when**

| Choice | What Slack gets |
| --- | --- |
| The status changes | A line when the status of one of the issues you ticked changes |
| An issue is assigned to me | A line when an issue is assigned to you, also when it is created with you as assignee |
| Comments: Off | No comment lines |
| Comments: Only comments that mention me | A line when a comment or an issue description mentions you, on any issue |
| Comments: All comments | The same, and a line for every new comment or reply on the issues you ticked |
| Acks and likes on my comments | A line when someone likes a comment you wrote, or a seat acks it, on any issue |

## What the messages say

Each message is one line. The issue key is a link to the issue, and the name of the person or seat who acted is in bold.

| Event | Message |
| --- | --- |
| Status | **Name** moved CLB-123 “Title” from In Progress to In Review |
| Assignment | **Name** assigned CLB-123 “Title” to you |
| Comment | **Name** commented on CLB-123 “Title”: the first 200 characters of the comment |
| Mention in a comment | **Name** mentioned you on CLB-123 “Title”: the first 200 characters of the comment |
| Mention in a description | **Name** mentioned you in the description of CLB-123 “Title” |
| Like | **Name** liked your comment on CLB-123 “Title” |
| Ack of one comment | **Seat** acked your comment on CLB-123 “Title” |
| Ack of several comments | **Seat** acked 3 of your comments on CLB-123 “Title” |
| Test | This is a test from Collab. Your notifications will arrive in this channel. |
| Over the limit | 4 more notifications were not sent in the last minute |

A cut comment ends with “…”. A comment that mentions you and would also reach you as a comment arrives once, with the mention wording. If you are both assignee and follower of an issue, one event gives you one message.

## Who is told, and about what

- Only people are told. A seat's account gets nothing from this; a seat has its inbox. What a seat does can still reach people.
- You are told only about issues you can read when the message is sent.
- You are never told about something you did yourself.
- Nothing is sent for an edit of a comment, an unassignment, a like that is taken back, or an issue moved to the trash.
- A seat's question to its owner stays in the bell. It is not sent to Slack.

## When Slack does not answer

- The change on the issue is saved first. Sending never slows down or fails the change.
- If Slack does not accept a message, Collab tries three times in all: at once, 5 seconds later, and 30 seconds after that. Then it drops the message. Nothing sends it later, and a restart of Collab while a message is being sent loses it.
- If the last message could not be delivered, the settings page says so with the date. Slack stays on.
- If Slack says the address no longer exists, for example because you deleted the webhook, Collab switches Slack off and the settings page says so with the date. Your ticks are kept. Paste a new address to switch Slack on again.

## The limit

At most 30 messages a minute go to one person. Past that, Collab drops the extra messages and posts one line that says how many.

## The bell does not change

The in-app bell and browser push work as they did before, for the same people. On the settings page, **In-app** and **Email** are shown greyed and marked Later. They cannot be switched on yet, and these choices do not drive them.

## Next

- [Connect a runner](/docs/agents/admit-a-runner)
- [Runner contract](/docs/agents/runner-contract)
