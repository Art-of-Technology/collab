import { prisma } from '@/lib/prisma';
import type { Ask } from '@/lib/agent-runs';
import { PERSON, earlyAnswers } from '@/lib/agent-stop-boundary';
import { escapeHtml, sendEmail } from '@/lib/email';
import { issueReadAccessWhere } from '@/lib/issue-finder';

const NOT_SENT = 'Declared stop email was not sent';
/** Written on the issue's timeline when an email is handed to the sender, with who it is for: what the hourly limit remembers. */
const EMAILED = 'AGENT_STOP_EMAILED';
const HOUR = 60 * 60_000;
const FOOTER = 'You get this because a seat named you on this issue. To stop these emails, turn off email notifications in your Collab settings.';

/** The agreed wording: the subject, the paragraphs before the link, the words the link follows, and the paragraphs after it. */
function wording(ask: Ask, seat: string, key: string, title: string, time: string) {
  const stopped = `${seat} stopped work on ${key} (${title}) at ${time}`;
  const waits = 'The work on this issue waits until someone answers.';
  if (ask.kind === 'hands') {
    return { subject: `${key}: ${seat} is waiting for you to do something`, before: [`${stopped}. The next step is one only you can take.`, ask.steps],
      lead: `When it is done, reply "${ask.doneWord}" on the issue: `, after: [] };
  }
  const [first] = ask.questions, count = ask.questions.length;
  if (count === 1) {
    return { subject: `${key}: ${seat} needs a decision from you`, before: [`${stopped} and is waiting for your answer.`, first.question,
      `Reply with one of: ${first.options.join(', ')}.${first.suggested ? ` ${seat} suggests ${first.suggested}.` : ''}`], lead: 'Answer here: ', after: [waits] };
  }
  return { subject: `${key}: ${seat} has ${count} questions for you`, before: [`${stopped} and is waiting for ${count} answers from you.`,
    ask.questions.map(({ question, options, suggested }, index) => `${index + 1}. ${question}\n   Reply words: ${options.join(', ')}.${suggested ? ` Suggested: ${suggested}.` : ''}`).join('\n')],
  lead: 'Answer on the issue: ', after: [waits] };
}

/**
 * Declared stops: one email to the person a seat's finish names, with what it asks of them and the link to the issue.
 * Started once the finish is committed and not waited for, so everything is judged as it is at the moment of sending,
 * in this order:
 * - the run finished and is a seat's;
 * - nobody answered: no person before the finish (`earlyAnswers`, as the inbox and Home read it), and nobody but the
 *   seat after it, which is when Home clears the row;
 * - no email about this issue was handed to the sender for this person in the last hour. A seat can take its issue
 *   and stop again with no person acting in between, so without this it could send as often as it finishes;
 * - last, so that nothing read after it can let a change through: the named account is a person, the owner or an
 *   active member of the issue's workspace, may read the issue and has not switched email off. Email is off when
 *   either of the person's preferences says so: the one for this workspace, which the settings page writes, or the
 *   one for no workspace, which the notification service and push read. No stored preference means on.
 * Otherwise nothing is sent. A deployment without a mail key sends no email at all, and this says nothing. One that
 * does not say where it is reached sends none either: a built-in address would link to another installation.
 * A failure is logged in one fixed line and never thrown: the line names neither the person nor what was asked.
 */
export async function emailDeclaredStop({ runId, userId, ask }: { runId: string; userId: string; ask: Ask }) {
  if (!process.env.RESEND_API_KEY?.trim()) return;
  try {
    const address = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
    if (!address) throw new Error(NOT_SENT);
    const run = await prisma.agentRun.findFirst({ where: { id: runId, state: 'finished', endedAt: { not: null }, seatId: { not: null } },
      select: { issueId: true, userId: true, seatId: true, startedAt: true, endedAt: true, seat: { select: { name: true } } } });
    if (!run?.seat || !run.endedAt) return;
    const { issueId, endedAt } = run;
    if ((await earlyAnswers(prisma, [{ issueId, seatUserId: run.userId, startedAt: run.startedAt, endedAt }])).size
      || await prisma.issueComment.count({ where: { issueId, authorId: { not: run.userId }, createdAt: { gt: endedAt } } })) return;
    // shortcut: counted here and written below, not in one step, so two sends within the same few milliseconds both pass; a unique key needs a schema change.
    const emailed = { itemType: 'ISSUE', itemId: issueId, action: EMAILED, newValue: userId };
    if (await prisma.issueActivity.count({ where: { ...emailed, createdAt: { gt: new Date(Date.now() - HOUR) } } })) return;

    const off = { emailNotificationsEnabled: false };
    const person = { id: userId, ...PERSON, notificationPreferences: { none: { workspaceId: null, ...off } } };
    const issue = await prisma.issue.findFirst({
      where: { id: issueId, AND: [issueReadAccessWhere(userId)], workspace: {
        OR: [{ owner: person }, { members: { some: { status: true, user: person } } }],
        notificationPreferences: { none: { userId, ...off } } } },
      select: { issueKey: true, title: true, projectId: true, workspaceId: true,
        workspace: { select: { slug: true, owner: { select: { id: true, email: true } }, members: { where: { userId, status: true }, select: { user: { select: { email: true } } } } } } },
    });
    const to = issue && (issue.workspace.owner.id === userId ? issue.workspace.owner.email : issue.workspace.members[0]?.user.email);
    if (!to) return;

    const key = issue.issueKey ?? issueId;
    const url = new URL(`/${encodeURIComponent(issue.workspace.slug)}/issues/${encodeURIComponent(key)}`, address).href;
    const time = `${endedAt.toISOString().slice(11, 16)} UTC on ${endedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`;
    const { subject, before, lead, after } = wording(ask, run.seat.name, key, issue.title, time);
    // Everything a seat wrote is escaped; the one attribute holds the link, which is made of the workspace's and the issue's own names.
    const paragraph = (text: string) => `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;
    const link = `<a href="${escapeHtml(url)}" style="color: #22c55e; text-decoration: underline;">${escapeHtml(url)}</a>`;
    // Written before the email is handed over: an email that went out and was not remembered could be sent again and again.
    await prisma.issueActivity.create({ data: { ...emailed, userId: run.userId, workspaceId: issue.workspaceId, projectId: issue.projectId, fieldName: 'askedUser',
      details: JSON.stringify({ runId, seatId: run.seatId }) } });
    const { success } = await sendEmail({
      to,
      // A subject is one line, whatever the seat is called.
      subject: subject.replace(/\s+/g, ' '),
      text: [...before, `${lead}${url}`, ...after, FOOTER].join('\n\n'),
      html: ['<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">', ...before.map(paragraph), `<p>${escapeHtml(lead)}${link}</p>`,
        ...after.map(paragraph), `<p style="color: #666; font-size: 14px;">${FOOTER}</p>`, '</div>'].join('\n'),
    });
    // The sender reports a provider's failure in what it returns, and throws nothing.
    if (!success) throw new Error(NOT_SENT);
  } catch {
    console.error(NOT_SENT);
  }
}
