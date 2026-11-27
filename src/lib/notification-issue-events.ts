import { prisma } from '@/lib/prisma';
import { PERSON } from '@/lib/agent-stop-boundary';
import { issueReadAccessWhere } from '@/lib/issue-finder';
import { extractMentionUserIds } from '@/utils/mentions';
import { decrypt } from '@/lib/apps/crypto';
import { sendCapped, slackEscape } from '@/lib/notification-slack';
import { markSlackResult } from '@/lib/notification-settings';

export type IssueEvent =
  | { kind: 'status'; issueId: string; actorId: string; fromStatusId: string | null; toStatusId: string | null }
  | { kind: 'assigned'; issueId: string; actorId: string; assigneeId: string }
  | { kind: 'comment'; issueId: string; actorId: string; commentId: string; text: string }
  | { kind: 'described'; issueId: string; actorId: string; mentionedIds: string[] }
  | { kind: 'like'; issueId: string; actorId: string; commentAuthorId: string }
  | { kind: 'ack'; issueId: string; actorId: string; commentAuthorIds: string[] };
export type IssueFacts = { key: string; title: string; url: string | null; assigneeId: string | null; reporterId: string | null;
  followerIds: string[]; actorName: string; fromStatus: string | null; toStatus: string | null };
export type SettingRow = { userId: string; mineAssigned: boolean; mineReported: boolean; mineFollowed: boolean;
  onStatus: boolean; onAssigned: boolean; onReactions: boolean; comments: string };

const EXCERPT_LIMIT = 200;
/** Only this much of a comment is read for its excerpt, so a huge comment cannot hold the event loop. */
const EXCERPT_INPUT_LIMIT = 20_000;
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
const BLOCK_TAG = /^<\/?(p|div|br|li|ul|ol|h[1-6]|blockquote|pre|tr|td|th|table|hr)\b/i;

function isMentionSpan(attributes: string) {
  return /data-type=["']mention["']/.test(attributes) || /data-mention=["']true["']/.test(attributes)
    || /class=["'][^"']*\bmention\b[^"']*["']/.test(attributes);
}

/**
 * Drops every tag in one pass, so no tag can be rebuilt from the pieces of another (`<scr<script>ipt>`).
 * A `<` followed by a letter or `/` starts a tag that runs to the next `>` (or to the end); block-level tags
 * leave a space. A mention span's text is kept and reads `@name`.
 */
function stripTags(text: string): string {
  let out = '';
  let mention: { start: number; label: string } | null = null;
  let i = 0;
  while (i < text.length) {
    const next = text[i + 1];
    if (text[i] !== '<' || next === undefined || !(next === '/' || /[A-Za-z]/.test(next))) {
      out += text[i];
      i += 1;
      continue;
    }
    const close = text.indexOf('>', i + 1);
    const end = close === -1 ? text.length : close + 1;
    const tag = text.slice(i, end);
    i = end;
    if (/^<span\b/i.test(tag) && !mention && isMentionSpan(tag)) {
      mention = { start: out.length, label: tag.match(/data-label=["']([^"']*)["']/)?.[1] ?? '' };
    } else if (/^<\/span\b/i.test(tag) && mention) {
      const name = out.slice(mention.start).trim() || mention.label;
      out = out.slice(0, mention.start) + (name.startsWith('@') ? name : `@${name}`);
      mention = null;
    } else if (BLOCK_TAG.test(tag)) {
      out += ' ';
    }
  }
  return out;
}

/** A comment's text as one short plain line: mentions read as `@name`, tags and entities are gone. */
export function excerpt(text: string): string {
  let out = stripTags(String(text ?? '').slice(0, EXCERPT_INPUT_LIMIT));
  out = out.replace(/@\[([^\]]{1,100})\]\(([^)]{1,50})\)/g, '@$1');
  out = out.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name: string) => ENTITIES[name]);
  out = out.replace(/\s+/g, ' ').trim();
  const characters = Array.from(out);
  return characters.length > EXCERPT_LIMIT ? `${characters.slice(0, EXCERPT_LIMIT).join('')}…` : out;
}

/** A name or title on one line: every run of white space, line breaks included, is one space. */
function oneLine(text: string | null | undefined) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function hasRoleBox(row: SettingRow, facts: IssueFacts) {
  return (row.mineAssigned && facts.assigneeId === row.userId)
    || (row.mineReported && facts.reporterId === row.userId)
    || (row.mineFollowed && facts.followerIds.includes(row.userId));
}

function roleIds(facts: IssueFacts) {
  return [facts.assigneeId, facts.reporterId, ...facts.followerIds].filter((id): id is string => !!id);
}

function mentionedIdsOf(event: IssueEvent): string[] {
  if (event.kind === 'comment') return extractMentionUserIds(event.text);
  if (event.kind === 'described') return event.mentionedIds;
  return [];
}

/** Everyone `messagesFor` could consider for an event, without the actor. */
function candidateIds(event: IssueEvent, facts: Pick<IssueFacts, 'assigneeId' | 'reporterId' | 'followerIds'>): string[] {
  const ids: string[] = [];
  switch (event.kind) {
    case 'status': ids.push(...roleIds(facts as IssueFacts)); break;
    case 'assigned': ids.push(event.assigneeId); break;
    case 'comment': ids.push(...mentionedIdsOf(event), ...roleIds(facts as IssueFacts)); break;
    case 'described': ids.push(...event.mentionedIds); break;
    case 'like': ids.push(event.commentAuthorId); break;
    case 'ack': ids.push(...event.commentAuthorIds); break;
  }
  return [...new Set(ids.filter(id => id && id !== event.actorId))];
}

/** The Slack messages an event gives, one per person at most; pure. */
export function messagesFor(event: IssueEvent, facts: IssueFacts, settings: SettingRow[]): { userId: string; text: string }[] {
  if (!settings.length) return [];
  const key = slackEscape(oneLine(facts.key));
  const link = facts.url ? `<${facts.url}|${key}>` : key;
  const T = slackEscape(oneLine(facts.title));
  const A = slackEscape(oneLine(facts.actorName)).replace(/\*/g, '').trim() || 'Someone';
  const byId = new Map(settings.map(row => [row.userId, row]));
  const out: { userId: string; text: string }[] = [];
  const told = new Set<string>();
  const tell = (userId: string, text: string) => {
    if (!userId || userId === event.actorId || told.has(userId)) return;
    told.add(userId);
    out.push({ userId, text });
  };
  const wantsMentions = (row: SettingRow | undefined) => !!row && (row.comments === 'mentions' || row.comments === 'all');

  switch (event.kind) {
    case 'status': {
      if (!facts.toStatus) return [];
      const to = slackEscape(oneLine(facts.toStatus));
      const text = facts.fromStatus
        ? `*${A}* moved ${link} “${T}” from ${slackEscape(oneLine(facts.fromStatus))} to ${to}`
        : `*${A}* moved ${link} “${T}” to ${to}`;
      for (const id of roleIds(facts)) {
        const row = byId.get(id);
        if (row?.onStatus && hasRoleBox(row, facts)) tell(id, text);
      }
      break;
    }
    case 'assigned': {
      const row = byId.get(event.assigneeId);
      if (row?.onAssigned) tell(event.assigneeId, `*${A}* assigned ${link} “${T}” to you`);
      break;
    }
    case 'comment': {
      // The excerpt is made only when someone will get it.
      let cached: string | null = null;
      const body = () => (cached ??= slackEscape(excerpt(event.text)));
      const mentioned = new Set(extractMentionUserIds(event.text));
      for (const id of mentioned) {
        if (wantsMentions(byId.get(id))) tell(id, `*${A}* mentioned you on ${link} “${T}”: ${body()}`);
      }
      for (const id of roleIds(facts)) {
        if (mentioned.has(id)) continue;
        const row = byId.get(id);
        if (row?.comments === 'all' && hasRoleBox(row, facts)) tell(id, `*${A}* commented on ${link} “${T}”: ${body()}`);
      }
      break;
    }
    case 'described': {
      for (const id of event.mentionedIds) {
        if (wantsMentions(byId.get(id))) tell(id, `*${A}* mentioned you in the description of ${link} “${T}”`);
      }
      break;
    }
    case 'like': {
      if (byId.get(event.commentAuthorId)?.onReactions) tell(event.commentAuthorId, `*${A}* liked your comment on ${link} “${T}”`);
      break;
    }
    case 'ack': {
      const counts = new Map<string, number>();
      for (const id of event.commentAuthorIds) counts.set(id, (counts.get(id) ?? 0) + 1);
      for (const [id, n] of counts) {
        if (!byId.get(id)?.onReactions) continue;
        tell(id, n === 1 ? `*${A}* acked your comment on ${link} “${T}”` : `*${A}* acked ${n} of your comments on ${link} “${T}”`);
      }
      break;
    }
  }
  return out;
}

/** An error as a log string with every secret taken out; never the error object, whose stack may carry them. */
function describe(error: unknown, secrets: string[] = []) {
  let message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  for (const secret of secrets) if (secret) message = message.split(secret).join('[address]');
  return message.replace(/https?:\/\/hooks\.slack\.com\/\S*/gi, '[address]');
}

function issueUrl(slug: string, issueKey: string | null, issueId: string): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
  if (!base) return null;
  try {
    return new URL(`/${encodeURIComponent(slug)}/issues/${encodeURIComponent(issueKey ?? issueId)}`, base).href;
  } catch {
    return null;
  }
}

async function deliver(event: IssueEvent) {
  const issue = await prisma.issue.findUnique({
    where: { id: event.issueId },
    select: { id: true, issueKey: true, title: true, workspaceId: true, assigneeId: true, reporterId: true, workspace: { select: { slug: true } } },
  });
  if (!issue) return;

  let fromStatus: string | null = null;
  let toStatus: string | null = null;
  if (event.kind === 'status') {
    const ids = [event.fromStatusId, event.toStatusId].filter((id): id is string => !!id);
    const rows = ids.length
      ? await prisma.projectStatus.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, displayName: true } })
      : [];
    const nameOf = (id: string | null) => {
      const row = id ? rows.find(status => status.id === id) : undefined;
      return row ? (row.displayName || row.name) : null;
    };
    fromStatus = nameOf(event.fromStatusId);
    toStatus = nameOf(event.toStatusId);
  }
  const actor = await prisma.user.findUnique({ where: { id: event.actorId }, select: { name: true } });
  // Followers matter only to the events that tell an issue's roles.
  const followers = event.kind === 'status' || event.kind === 'comment'
    ? await prisma.issueFollower.findMany({ where: { issueId: issue.id }, select: { userId: true } })
    : [];

  const facts: IssueFacts = {
    key: issue.issueKey ?? issue.id,
    title: issue.title,
    url: issueUrl(issue.workspace?.slug ?? '', issue.issueKey, issue.id),
    assigneeId: issue.assigneeId,
    reporterId: issue.reporterId,
    followerIds: followers.map(follower => follower.userId),
    actorName: actor?.name ?? '',
    fromStatus,
    toStatus,
  };
  const ids = candidateIds(event, facts);
  if (!ids.length) return;

  const settings = await prisma.issueNotificationSetting.findMany({
    where: { workspaceId: issue.workspaceId, userId: { in: ids }, slackOn: true, slackUrlEnc: { not: null }, user: PERSON },
    select: { userId: true, slackUrlEnc: true, mineAssigned: true, mineReported: true, mineFollowed: true, onStatus: true, onAssigned: true, onReactions: true, comments: true, slackFailedAt: true },
  });
  const rowOf = new Map(settings.map(row => [row.userId, row]));

  // Each person is sent to on their own, so one slow or dead address does not hold the others.
  const sendOne = async (message: { userId: string; text: string }) => {
    let url = '';
    try {
      const readable = await prisma.issue.findFirst({ where: { id: issue.id, AND: [issueReadAccessWhere(message.userId)] }, select: { id: true } });
      if (!readable) return;
      const row = rowOf.get(message.userId);
      if (!row?.slackUrlEnc) return;
      url = await decrypt(Buffer.from(row.slackUrlEnc));
      const result = await sendCapped(`${issue.workspaceId}:${message.userId}`, url, message.text);
      if (result === 'gone' || result === 'failed' || (result === 'ok' && row.slackFailedAt)) {
        await markSlackResult(message.userId, issue.workspaceId, result);
      }
    } catch (error) {
      console.error(`[issue-notify] sending a ${event.kind} message failed: ${describe(error, [url])}`);
    }
  };
  await Promise.allSettled(messagesFor(event, facts, settings).map(sendOne));
}

const pending = new Set<Promise<void>>();

/** Starts the Slack delivery for an event and returns at once; never throws, never awaited by callers. */
export function tellIssueEvent(event: IssueEvent): void {
  try {
    const run = (async () => {
      try {
        await deliver(event);
      } catch (error) {
        console.error(`[issue-notify] delivering a ${event?.kind} event failed: ${describe(error)}`);
      }
    })().catch(() => {});
    pending.add(run);
    void run.finally(() => pending.delete(run));
  } catch {
    // Starting the delivery cannot fail a caller.
  }
}

/** Resolves when every delivery started so far has ended; for tests. */
export async function issueEventsSettled(): Promise<void> {
  while (pending.size) await Promise.all([...pending]);
}
