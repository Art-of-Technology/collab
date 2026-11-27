// Keeps the Slack address (a secret) out of Sentry: it is the path of the webhook URL and the body of one route.
const SLACK_ROUTE = '/api/user/notification-preferences/issues/slack';

export function ignoreSlackRequest(url: string): boolean {
  return typeof url === 'string' && url.startsWith('https://hooks.slack.com/');
}

export function scrubSlackRoute<T extends { request?: { url?: string; data?: unknown } }>(event: T): T {
  const request = event.request;
  if (request && typeof request.url === 'string' && request.url.includes(SLACK_ROUTE)) delete request.data;
  return event;
}
