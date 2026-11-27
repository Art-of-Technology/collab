import { prisma } from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/apps/crypto';
import {
  isSlackWebhookUrl,
  maskSlackWebhookUrl,
  postToSlack,
  SLACK_TEST_TEXT,
  type SlackResult,
} from '@/lib/notification-slack';

export type CommentsChoice = 'off' | 'mentions' | 'all';
export type IssueNotificationChoices = {
  mineAssigned: boolean;
  mineReported: boolean;
  mineFollowed: boolean;
  onStatus: boolean;
  onAssigned: boolean;
  onReactions: boolean;
  comments: CommentsChoice;
};
export type IssueNotificationView = IssueNotificationChoices & {
  // `address` is the masked form; the address itself never leaves the server.
  slack: { address: string | null; on: boolean; offAt: string | null; failedAt: string | null };
};

export const NO_CHOICES: IssueNotificationChoices = Object.freeze({
  mineAssigned: false, mineReported: false, mineFollowed: false,
  onStatus: false, onAssigned: false, onReactions: false, comments: 'off',
}) as IssueNotificationChoices;

export const STARTING_SET: IssueNotificationChoices = Object.freeze({
  mineAssigned: true, mineReported: true, mineFollowed: true,
  onStatus: true, onAssigned: true, onReactions: true, comments: 'mentions',
}) as IssueNotificationChoices;

const BOOLEAN_KEYS = ['mineAssigned', 'mineReported', 'mineFollowed', 'onStatus', 'onAssigned', 'onReactions'] as const;
const COMMENTS_CHOICES: readonly string[] = ['off', 'mentions', 'all'];
// Shown when an address is stored but cannot be decrypted (for example after a key change).
const UNREADABLE_MASK = 'https://hooks.slack.com/services/••••••';

type Row = {
  slackUrlEnc: Uint8Array | null;
  slackOn: boolean;
  slackEverOn: boolean;
  slackOffAt: Date | null;
  slackFailedAt: Date | null;
  mineAssigned: boolean;
  mineReported: boolean;
  mineFollowed: boolean;
  onStatus: boolean;
  onAssigned: boolean;
  onReactions: boolean;
  comments: string;
};

const key = (userId: string, workspaceId: string) => ({ userId_workspaceId: { userId, workspaceId } });

async function findRow(userId: string, workspaceId: string): Promise<Row | null> {
  return prisma.issueNotificationSetting.findUnique({ where: key(userId, workspaceId) }) as Promise<Row | null>;
}

async function storedUrl(row: Row | null): Promise<string | null> {
  if (!row?.slackUrlEnc) return null;
  try {
    return await decrypt(Buffer.from(row.slackUrlEnc));
  } catch {
    return null;
  }
}

async function view(row: Row | null): Promise<IssueNotificationView> {
  if (!row) return { ...NO_CHOICES, slack: { address: null, on: false, offAt: null, failedAt: null } };
  let address: string | null = null;
  if (row.slackUrlEnc) {
    const url = await storedUrl(row);
    address = url && isSlackWebhookUrl(url) ? maskSlackWebhookUrl(url) : UNREADABLE_MASK;
  }
  const comments = COMMENTS_CHOICES.includes(row.comments) ? (row.comments as CommentsChoice) : 'off';
  return {
    mineAssigned: row.mineAssigned,
    mineReported: row.mineReported,
    mineFollowed: row.mineFollowed,
    onStatus: row.onStatus,
    onAssigned: row.onAssigned,
    onReactions: row.onReactions,
    comments,
    slack: {
      address,
      on: row.slackOn,
      offAt: row.slackOffAt ? new Date(row.slackOffAt).toISOString() : null,
      failedAt: row.slackFailedAt ? new Date(row.slackFailedAt).toISOString() : null,
    },
  };
}

async function upsert(userId: string, workspaceId: string, data: Record<string, unknown>): Promise<Row> {
  return prisma.issueNotificationSetting.upsert({
    where: key(userId, workspaceId),
    create: { userId, workspaceId, ...data },
    update: data,
  }) as Promise<Row>;
}

export async function readSettings(userId: string, workspaceId: string): Promise<IssueNotificationView> {
  return view(await findRow(userId, workspaceId));
}

/** Checks a patch of choices: only the seven keys, each of its own type. */
export function parseChoices(patch: unknown): Partial<IssueNotificationChoices> | null {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return null;
  const out: Partial<IssueNotificationChoices> = {};
  for (const [name, value] of Object.entries(patch as Record<string, unknown>)) {
    if ((BOOLEAN_KEYS as readonly string[]).includes(name)) {
      if (typeof value !== 'boolean') return null;
      out[name as (typeof BOOLEAN_KEYS)[number]] = value;
    } else if (name === 'comments') {
      if (typeof value !== 'string' || !COMMENTS_CHOICES.includes(value)) return null;
      out.comments = value as CommentsChoice;
    } else {
      return null;
    }
  }
  return out;
}

export async function updateChoices(userId: string, workspaceId: string, patch: unknown): Promise<IssueNotificationView | { error: 'invalid' }> {
  const choices = parseChoices(patch);
  if (!choices) return { error: 'invalid' };
  if (Object.keys(choices).length === 0) return readSettings(userId, workspaceId);
  return view(await upsert(userId, workspaceId, choices));
}

export async function saveSlackAddress(userId: string, workspaceId: string, url: unknown): Promise<IssueNotificationView | { error: 'not_slack' | 'not_configured' }> {
  if (!isSlackWebhookUrl(url)) return { error: 'not_slack' };
  let slackUrlEnc: Buffer;
  try {
    slackUrlEnc = await encrypt(url);
  } catch {
    return { error: 'not_configured' };
  }
  return view(await upsert(userId, workspaceId, { slackUrlEnc, slackOffAt: null, slackFailedAt: null }));
}

export async function setSlackOn(userId: string, workspaceId: string, on: boolean): Promise<IssueNotificationView | { error: 'no_address' }> {
  const row = await findRow(userId, workspaceId);
  if (!on) {
    if (!row) return view(null);
    return view(await upsert(userId, workspaceId, { slackOn: false }));
  }
  if (!row?.slackUrlEnc) return { error: 'no_address' };
  const data: Record<string, unknown> = { slackOn: true, slackOffAt: null, slackFailedAt: null };
  if (!row.slackEverOn) Object.assign(data, STARTING_SET, { slackEverOn: true });
  return view(await upsert(userId, workspaceId, data));
}

export async function removeSlackAddress(userId: string, workspaceId: string): Promise<IssueNotificationView> {
  const row = await findRow(userId, workspaceId);
  if (!row) return view(null);
  return view(await upsert(userId, workspaceId, { slackUrlEnc: null, slackOn: false, slackOffAt: null, slackFailedAt: null }));
}

export async function sendSlackTest(userId: string, workspaceId: string): Promise<{ result: SlackResult | 'no_address'; settings: IssueNotificationView }> {
  const row = await findRow(userId, workspaceId);
  const url = await storedUrl(row);
  if (!url) return { result: 'no_address', settings: await view(row) };
  const result = await postToSlack(url, SLACK_TEST_TEXT);
  if (result === 'ok') {
    try {
      await prisma.issueNotificationSetting.update({ where: key(userId, workspaceId), data: { slackFailedAt: null } });
    } catch {
      // The test message went through; a failed bookkeeping write does not change that.
    }
  } else {
    await markSlackResult(userId, workspaceId, result);
  }
  return { result, settings: await readSettings(userId, workspaceId) };
}

export async function markSlackResult(userId: string, workspaceId: string, result: SlackResult): Promise<void> {
  try {
    if (result === 'gone') {
      await prisma.issueNotificationSetting.update({ where: key(userId, workspaceId), data: { slackOn: false, slackOffAt: new Date() } });
    } else if (result === 'failed') {
      await prisma.issueNotificationSetting.update({ where: key(userId, workspaceId), data: { slackFailedAt: new Date() } });
    }
  } catch {
    // Bookkeeping only: it never throws, and it never logs, because the error could carry the address.
  }
}
