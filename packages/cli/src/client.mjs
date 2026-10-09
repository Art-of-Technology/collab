import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { windowsAcl } from './windows-acl.mjs';

export class CliError extends Error {
  constructor(code, message, exit = 2, details = {}) { super(message); this.code = code; this.exit = exit; this.details = details; }
}
export function origin(value) {
  let url;
  try { url = new URL(value); } catch { throw new CliError('invalid_origin', 'Use an HTTPS origin, without a path or credentials.'); }
  const local = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new CliError('invalid_origin', 'Use HTTPS; HTTP is allowed only on loopback for local development.');
  }
  return url.origin;
}
export function store(profile = 'default') {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(profile)) throw new CliError('invalid_profile', 'Profile must contain only letters, digits, underscores or hyphens.');
  const directory = path.resolve(process.env.COLLAB_CONFIG_DIR || path.join(os.homedir(), '.config', 'collab'));
  const file = path.join(directory, `${profile}.json`);
  const windows = process.platform === 'win32';
  function check(stat, isDirectory, target) {
    const privateAccess = windows ? windowsAcl(target) : !(stat.mode & 0o077) && (!process.getuid || stat.uid === process.getuid());
    if (!(isDirectory ? stat.isDirectory() : stat.isFile()) || !privateAccess) {
      throw new CliError('unsafe_credentials', 'CLI state must be private and owned by you, with no symlinks: Unix 0700/0600 or a private Windows ACL.');
    }
  }
  function prepare() {
    if (windows) {
      if (!windowsAcl(directory, true)) throw new CliError('unsafe_credentials', 'Cannot create or verify a private Windows credential directory.');
    } else fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    check(fs.lstatSync(directory), true, directory);
  }
  function load() {
    try {
      check(fs.lstatSync(directory), true, directory);
      if (windows && fs.lstatSync(file).isSymbolicLink()) throw new CliError('unsafe_credentials', 'CLI state cannot be a link.');
      const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      try {
        const stat = fs.fstatSync(fd); check(stat, false, file);
        if (stat.size > 65536) throw new Error('size');
        const state = JSON.parse(fs.readFileSync(fd, 'utf8'));
        if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('shape');
        return state;
      } finally { fs.closeSync(fd); }
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      if (error instanceof CliError) throw error;
      throw new CliError('invalid_credentials', 'Cannot safely read CLI state. No credentials were used.');
    }
  }
  function save(state) {
    prepare();
    const temporary = `${file}.${randomBytes(8).toString('hex')}.tmp`;
    try {
      // Set the owner at creation: elevated Windows processes can default to Administrators.
      if (windows && !windowsAcl(temporary, 'file')) throw new CliError('unsafe_credentials', 'Cannot create a private Windows credential file.');
      const fd = fs.openSync(temporary, windows ? 'r+' : 'wx', 0o600);
      try {
        check(fs.fstatSync(fd), false, temporary);
        fs.writeFileSync(fd, JSON.stringify(state) + '\n'); fs.fsyncSync(fd);
      } finally { fs.closeSync(fd); }
      fs.renameSync(temporary, file);
      // Windows cannot open directories for fsync; the credential file itself was flushed above.
      if (!windows) { const parent = fs.openSync(directory, 'r'); try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); } }
    }
    finally { try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  }
  async function exclusive(callback) {
    prepare();
    const lock = `${file}.lock`;
    let fd;
    try { fd = fs.openSync(lock, 'wx', 0o600); }
    catch { throw new CliError('state_locked', 'Another login/configuration change is active. A stale lock requires explicit removal.'); }
    try { return await callback(load(), save); }
    finally { fs.closeSync(fd); fs.unlinkSync(lock); }
  }
  return { load, exclusive };
}

export async function request(base, endpoint, { token, method = 'GET', body, timeout = 30000, form = false } = {}) {
  if (!endpoint.startsWith('/') || endpoint.startsWith('//')) throw new CliError('invalid_path', 'Invalid API path.');
  const headers = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = form ? 'application/x-www-form-urlencoded' : 'application/json';
  const mutation = method !== 'GET';
  let response, text;
  try {
    response = await fetch(new URL(endpoint, origin(base)), {
      method, headers, redirect: 'error', signal: AbortSignal.timeout(timeout),
      ...(body !== undefined ? { body: form ? new URLSearchParams(body).toString() : JSON.stringify(body) } : {}),
    });
    const chunks = []; let size = 0;
    if (response.body) for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 8 * 1024 * 1024) throw new Error('response cap');
      chunks.push(chunk);
    }
    text = Buffer.concat(chunks).toString('utf8');
  } catch {
    throw new CliError(mutation ? 'outcome_unknown' : 'transport_failed', mutation ? 'Request completion is unknown. Inspect Collab before retrying; no retry was made.' : 'Request failed or exceeded its time/size limit. No retry was made.', 5);
  }
  if (!response.ok) {
    const codes = { 400: 'invalid_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 429: 'rate_limited' };
    let code = codes[response.status] || 'server_error';
    let retrievalMessage;
    try {
      const remoteCode = JSON.parse(text).error;
      if (remoteCode === 'forge_connected_project') code = remoteCode;
      const messages = {
        semantic_unavailable: [503, 'Semantic search is unavailable. Use --mode keyword or --mode hybrid for explicit keyword fallback.'],
        budget_too_small: [422, 'Increase --max-tokens to fit at least one result or context section.'],
        scope_too_large: [422, 'The readable scope exceeds the supported limit. Narrow search by project, content type or dates.'],
      };
      if (!mutation && /^\/api\/apps\/auth\/(search|ai-context)(\?|$)/.test(endpoint) && Object.hasOwn(messages, remoteCode) && messages[remoteCode][0] === response.status) {
        code = remoteCode; retrievalMessage = messages[remoteCode][1];
      }
    } catch { /* Never echo remote error bodies. */ }
    if (mutation && response.status >= 500) code = 'outcome_unknown';
    throw new CliError(code, retrievalMessage || (code === 'outcome_unknown' ? 'Server failed after dispatch. Inspect Collab before retrying.' : `Collab refused the request (HTTP ${response.status}).`), response.status === 401 ? 3 : response.status === 403 ? 4 : 5, { status: response.status });
  }
  if (!text && (response.status === 204 || endpoint === '/api/oauth/revoke')) return { ok: true };
  try {
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('content type');
    return JSON.parse(text);
  } catch { throw new CliError(mutation ? 'outcome_unknown' : 'invalid_response', 'Expected a JSON response. Response body omitted; no retry was made.', 5); }
}

export function session(options, state) {
  const explicit = options.url || process.env.COLLAB_URL;
  const base = origin(explicit || state.origin || 'https://collab.weez.boo');
  const envToken = process.env.COLLAB_TOKEN;
  if (envToken && !explicit) throw new CliError('token_origin_required', 'COLLAB_TOKEN requires an explicit COLLAB_URL or --url.');
  if (!envToken && state.origin && base !== state.origin) throw new CliError('origin_mismatch', 'Stored credentials belong to another origin. Select a different profile or log in there.');
  const token = envToken || state.accessToken;
  if (!token || typeof token !== 'string' || /[\s\x00-\x1f]/.test(token)) throw new CliError('login_required', 'Run collab auth login, or set COLLAB_TOKEN with COLLAB_URL.', 3);
  if (!envToken && state.expiresAt <= Date.now()) throw new CliError('token_expired', 'Run collab auth refresh or collab auth login.', 3);
  const workspace = options.workspace || process.env.COLLAB_WORKSPACE || (!envToken ? state.workspace : undefined);
  const project = options.project || process.env.COLLAB_PROJECT || (!envToken && workspace === state.workspace ? state.project : undefined);
  return { base, token, workspace, project };
}
