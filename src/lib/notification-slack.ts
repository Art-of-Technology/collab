// Sends a message to a Slack incoming webhook. The address is a secret: nothing here logs it.
export const SLACK_RETRY_DELAYS_MS = [0, 5_000, 30_000] as const;
export const SLACK_TIMEOUT_MS = 5_000;
export const SLACK_CAP_PER_MINUTE = 30;
export const SLACK_TEST_TEXT = 'This is a test from Collab. Your notifications will arrive in this channel.';

const WINDOW_MS = 60_000;
const PATH = /^\/services\/[A-Za-z0-9_/-]+$/;

export type SlackResult = 'ok' | 'gone' | 'failed';

export function isSlackWebhookUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 512) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.hostname === 'hooks.slack.com' &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    url.search === '' &&
    url.hash === '' &&
    PATH.test(url.pathname)
  );
}

export function maskSlackWebhookUrl(url: string): string {
  const parts = new URL(url).pathname.split('/').filter(Boolean).slice(1);
  const masked = parts.map((part, i) => (i === parts.length - 1 ? `••••••${part.slice(-4)}` : `${part.slice(0, 3)}•••`));
  return `https://hooks.slack.com/services/${masked.join('/')}`;
}

export function slackEscape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function postToSlack(url: string, text: string): Promise<SlackResult> {
  if (!isSlackWebhookUrl(url)) return 'failed';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SLACK_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (response.status === 200) return 'ok';
    if (response.status === 404 || response.status === 410) return 'gone';
    return 'failed';
  } catch {
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}

type Sleep = (ms: number) => Promise<void>;

// The first try has no wait: resolving at once starts no timer, so nothing depends on the process staying alive for it.
const defaultSleep: Sleep = (ms) =>
  ms <= 0 ? Promise.resolve() : new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    (timer as { unref?: () => void }).unref?.();
  });

export async function sendToSlack(url: string, text: string, sleep: Sleep = defaultSleep): Promise<SlackResult> {
  let result: SlackResult = 'failed';
  for (const delay of SLACK_RETRY_DELAYS_MS) {
    await sleep(delay);
    result = await postToSlack(url, text);
    if (result === 'ok' || result === 'gone') return result;
  }
  return result;
}

export type CapClock = { now(): number; later(run: () => void, ms: number): void };

const defaultClock: CapClock = {
  now: () => Date.now(),
  later: (run, ms) => {
    const timer = setTimeout(run, ms);
    (timer as { unref?: () => void }).unref?.();
  },
};

type Window = { start: number; sent: number; capped: number; url: string; flushed: boolean };
const windows = new Map<string, Window>();

function flush(key: string, window: Window, sleep?: Sleep): void {
  if (window.flushed) return;
  window.flushed = true;
  if (windows.get(key) === window) windows.delete(key);
  if (window.capped === 0) return;
  const n = window.capped;
  const text = n === 1 ? '1 more notification was not sent in the last minute' : `${n} more notifications were not sent in the last minute`;
  void sendToSlack(window.url, text, sleep).catch(() => undefined);
}

export async function sendCapped(
  key: string,
  url: string,
  text: string,
  clock: CapClock = defaultClock,
  sleep?: Sleep,
): Promise<SlackResult | 'capped'> {
  let window = windows.get(key);
  if (window && clock.now() - window.start >= WINDOW_MS) {
    flush(key, window, sleep);
    window = undefined;
  }
  if (!window) {
    const fresh: Window = { start: clock.now(), sent: 0, capped: 0, url, flushed: false };
    windows.set(key, fresh);
    clock.later(() => flush(key, fresh, sleep), WINDOW_MS);
    window = fresh;
  }
  window.url = url;
  if (window.sent >= SLACK_CAP_PER_MINUTE) {
    window.capped += 1;
    return 'capped';
  }
  window.sent += 1;
  return sendToSlack(url, text, sleep);
}

export function forgetSlackCaps(): void {
  windows.clear();
}
