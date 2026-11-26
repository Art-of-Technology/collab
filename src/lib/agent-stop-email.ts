import { prisma } from '@/lib/prisma';
import type { Ask } from '@/lib/agent-runs';
import { earlyAnswers } from '@/lib/agent-stop-boundary';
import { appUrl, escapeHtml, sendEmail } from '@/lib/email';
import { issueReadAccessWhere } from '@/lib/issue-finder';

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
 * Started once the finish is committed, so everything is judged as it is at the moment of sending: the run finished
 * and is a seat's; the named account is a person (it has an email address and is no seat's) who is the owner or an
 * active member of the issue's workspace, may read the issue and has not switched email off; and nobody answered before
 * the finish (`earlyAnswers`, as the inbox and Home read it). Otherwise nothing is sent. Email is off when either of
 * the person's preferences says so: the one for this workspace, which the settings page writes, or the one for no
 * workspace, which the notification service and push read. No stored preference means on. The finish does not wait
 * for this: a failure is logged and never thrown, and the log names neither the person nor what was asked.
 */
export async function emailDeclaredStop({ runId, userId, ask }: { runId: string; userId: string; ask: Ask }) {
  try {
    const off = { emailNotificationsEnabled: false };
    const person = { id: userId, email: { not: null }, agentSeat: { is: null }, notificationPreferences: { none: { workspaceId: null, ...off } } };
    const run = await prisma.agentRun.findFirst({
      where: { id: runId, state: 'finished', endedAt: { not: null }, seatId: { not: null }, issue: { AND: [issueReadAccessWhere(userId)], workspace: {
        OR: [{ owner: person }, { members: { some: { status: true, user: person } } }],
        notificationPreferences: { none: { userId, ...off } } } } },
      select: { userId: true, startedAt: true, endedAt: true, seat: { select: { name: true } }, issue: { select: { id: true, issueKey: true, title: true,
        workspace: { select: { slug: true, owner: { select: { id: true, email: true } }, members: { where: { userId, status: true }, select: { user: { select: { email: true } } } } } } } } },
    });
    if (!run?.seat || !run.endedAt) return;
    const { issue, endedAt } = run, { workspace } = issue;
    const to = workspace.owner.id === userId ? workspace.owner.email : workspace.members[0]?.user.email;
    if (!to || (await earlyAnswers(prisma, [{ issueId: issue.id, seatUserId: run.userId, startedAt: run.startedAt, endedAt }])).size) return;

    const key = issue.issueKey ?? issue.id;
    const url = new URL(`/${encodeURIComponent(workspace.slug)}/issues/${encodeURIComponent(key)}`, appUrl()).href;
    const time = `${endedAt.toISOString().slice(11, 16)} UTC on ${endedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`;
    const { subject, before, lead, after } = wording(ask, run.seat.name, key, issue.title, time);
    // Everything a seat wrote is escaped; the one attribute holds the link, which is made of the workspace's and the issue's own names.
    const paragraph = (text: string) => `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;
    const link = `<a href="${escapeHtml(url)}" style="color: #22c55e; text-decoration: underline;">${escapeHtml(url)}</a>`;
    await sendEmail({
      to,
      // A subject is one line, whatever the seat is called.
      subject: subject.replace(/\s+/g, ' '),
      text: [...before, `${lead}${url}`, ...after, FOOTER].join('\n\n'),
      html: ['<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">', ...before.map(paragraph), `<p>${escapeHtml(lead)}${link}</p>`,
        ...after.map(paragraph), `<p style="color: #666; font-size: 14px;">${FOOTER}</p>`, '</div>'].join('\n'),
    });
  } catch {
    console.error('Declared stop email was not sent');
  }
}
