import { createServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { CliError, origin, request } from './client.mjs';
import { scopes } from './commands.mjs';

function tokens(data, previous = {}) {
  if (!data || typeof data.access_token !== 'string' || !data.access_token || /\s/.test(data.access_token) || data.token_type?.toLowerCase() !== 'bearer' || !Number.isSafeInteger(data.expires_in) || data.expires_in <= 0 || data.expires_in > 366 * 86400 || typeof data.workspace_id !== 'string' || !data.workspace_id) {
    throw new CliError('invalid_token_response', 'Login returned an invalid token response. Credentials were not saved.', 3);
  }
  if (data.refresh_token !== undefined && (typeof data.refresh_token !== 'string' || !data.refresh_token || /\s/.test(data.refresh_token))) throw new CliError('invalid_token_response', 'Invalid refresh token. Credentials were not saved.', 3);
  return { ...previous, accessToken: data.access_token, refreshToken: data.refresh_token || previous.refreshToken, expiresAt: Date.now() + data.expires_in * 1000, workspace: data.workspace_id, scopes: typeof data.scope === 'string' ? data.scope.split(' ').filter(Boolean) : [] };
}

async function verifyIdentity(base, token) {
  const identity = await request(base, '/api/apps/auth/user/me', { token });
  if (!identity || typeof identity.id !== 'string' || !identity.id) throw new CliError('invalid_identity', 'Login identity could not be verified. Credentials were not saved.', 3);
  return identity;
}

export async function login(options, state, save) {
  const base = origin(options.url || process.env.COLLAB_URL || state.origin || 'https://collab.weez.boo');
  const clientId = options['client-id'] || 'collab-cli';
  const verifier = randomBytes(32).toString('base64url');
  const stateNonce = randomBytes(32).toString('base64url');
  let resolveCode, rejectCode, settled = false;
  const codePromise = new Promise((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });
  // Bind only loopback; random port. Invalid callbacks cannot consume the flow.
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const returnedState = url.searchParams.get('state') || '';
    const equalState = Buffer.byteLength(returnedState) === Buffer.byteLength(stateNonce) && timingSafeEqual(Buffer.from(returnedState), Buffer.from(stateNonce));
    if (settled || req.method !== 'GET' || url.pathname !== '/callback' || !equalState || url.searchParams.getAll('state').length !== 1) { res.writeHead(400); res.end('Invalid callback.'); return; }
    if (url.searchParams.has('error')) { settled = true; res.end('Authorization declined. Return to your terminal.'); rejectCode(new CliError('access_denied', 'Authorization declined.', 3)); return; }
    const code = url.searchParams.get('code');
    if (!code || code.length > 2048 || url.searchParams.getAll('code').length !== 1) { res.writeHead(400); res.end('Invalid callback.'); return; }
    settled = true;
    res.end('Authorization received. Check your terminal for the final result.');
    resolveCode(code);
  });
  server.requestTimeout = 5000; server.headersTimeout = 5000;
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const redirect = `http://127.0.0.1:${server.address().port}/callback`;
  const authorization = new URL('/auth/mcp', base);
  const requestedScopes = options['read-only'] ? scopes.filter(value => value.endsWith(':read')) : scopes;
  authorization.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', state: stateNonce, scope: requestedScopes.join(' '), code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', ...(options.workspace ? { workspace_id: options.workspace } : {}) }).toString();
  process.stderr.write(`Open this URL in your browser and approve the workspace:\n${authorization}\n`);
  const timer = setTimeout(() => rejectCode(new CliError('login_timeout', 'Login expired. No credentials saved.', 3)), 300000);
  const interrupt = () => rejectCode(new CliError('login_cancelled', 'Login cancelled.', 3));
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  try {
    const code = await codePromise;
    const data = await request(base, '/api/oauth/mcp/token', { method: 'POST', form: true, body: { grant_type: 'authorization_code', client_id: clientId, redirect_uri: redirect, code, code_verifier: verifier } });
    const next = tokens(data);
    const identity = await verifyIdentity(base, next.accessToken);
    save({ ...next, origin: base, clientId });
    return { authenticated: true, origin: base, workspace: next.workspace, identity };
  } finally {
    clearTimeout(timer); process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
}

export async function refresh(state, save) {
  if (!state.origin || !state.refreshToken || !state.clientId) throw new CliError('login_required', 'No refreshable login in this profile.', 3);
  const data = await request(state.origin, '/api/oauth/mcp/token', { method: 'POST', form: true, body: { grant_type: 'refresh_token', client_id: state.clientId, refresh_token: state.refreshToken } });
  const next = tokens(data, state);
  if (next.workspace !== state.workspace) throw new CliError('workspace_mismatch', 'Refresh changed the token workspace. Credentials were not saved.', 3);
  await verifyIdentity(state.origin, next.accessToken);
  save(next);
  return { refreshed: true, origin: state.origin, workspace: next.workspace };
}
