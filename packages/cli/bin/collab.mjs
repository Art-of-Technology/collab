#!/usr/bin/env node
import fs from 'node:fs';
import { commands, flagName, scopes } from '../src/commands.mjs';
import { CliError, request, session, store } from '../src/client.mjs';
import { login, refresh } from '../src/auth.mjs';

const booleans = new Set(['help', 'json', 'all', 'yes', 'dry-run', 'read-only']);
const globals = ['url', 'profile', 'workspace', 'project', 'timeout', 'json'];
function parse(argv) {
  const words = [], options = Object.create(null);
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (!item.startsWith('--')) { words.push(item); continue; }
    const [key, ...parts] = item.slice(2).split('=');
    if (Object.hasOwn(options, key)) throw new CliError('duplicate_option', 'Each option can be supplied only once.');
    if (booleans.has(key)) {
      if (parts.length) throw new CliError('invalid_option', `--${key} does not take a value.`);
      options[key] = true;
    } else {
      const value = parts.length ? parts.join('=') : argv[++i];
      if (value === undefined || value.startsWith('--')) throw new CliError('missing_value', `--${key} requires a value.`);
      options[key] = value;
    }
  }
  return { words, options };
}
function allowed(options, names) {
  if (Object.keys(options).some(key => !names.includes(key))) throw new CliError('unknown_option', `Supported options: ${names.map(n => `--${n}`).join(', ')}`);
}
function converted(value, type) {
  if (type === 'string') return value;
  if (type === 'boolean' && ['true', 'false'].includes(value)) return value === 'true';
  if (type === 'integer' && /^-?(0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value))) return Number(value);
  if (type === 'array') { try { const data = JSON.parse(value); if (Array.isArray(data) && data.every(v => typeof v === 'string')) return data; } catch { /* Fixed error below. */ } }
  throw new CliError('invalid_value', `Expected ${type}; arrays use JSON and booleans use true or false.`);
}
async function boundedInput(file) {
  const stream = file === '-' ? process.stdin : fs.createReadStream(file);
  const chunks = []; let size = 0;
  const timer = setTimeout(() => stream.destroy(new Error('input timeout')), 30000);
  try {
    for await (const chunk of stream) { size += chunk.length; if (size > 1024 * 1024) throw new CliError('input_too_large', 'Input is limited to 1 MiB.'); chunks.push(Buffer.from(chunk)); }
    return Buffer.concat(chunks).toString('utf8');
  } finally { clearTimeout(timer); if (file !== '-') stream.destroy(); }
}
function help() {
  return { name: 'collab', version: '0.1.0', output: 'JSON on stdout; errors on stderr', commands: Object.fromEntries(Object.entries(commands).map(([name, spec]) => [name, { ...spec, options: [...Object.keys(spec.fields), ...Object.keys(spec.query)].map(flagName) }])), localCommands: ['auth login', 'auth status', 'auth refresh', 'auth logout', 'config show', 'config set --workspace ID [--project ID]', 'schema'], globals, input: '--input FILE|- for a JSON body, or named field flags; --content-file/--description-file FILE|- for text', pagination: '--all on issues list, notes list, worklogs list; at most 100 pages', scopes };
}
async function main() {
  const { words, options } = parse(process.argv.slice(2));
  if (options.help || !words.length || words[0] === 'help' || words[0] === 'schema') return help();
  const name = commands[words[0]] ? words[0] : words.slice(0, 2).join(' ');
  const stateStore = store(options.profile);
  for (const key of ['workspace', 'project', 'workspace-id', 'project-id']) if (options[key] !== undefined && !/^[a-zA-Z0-9_-]+$/.test(options[key])) throw new CliError('invalid_identifier', 'Workspace and project selectors must be nonempty IDs.');
  if (name.startsWith('auth ') || name.startsWith('config ')) {
    const localOptions = name === 'auth login' ? ['url', 'workspace', 'read-only'] : name === 'config set' ? ['workspace', 'project'] : [];
    allowed(options, ['profile', 'json', ...localOptions]);
    if (words.length !== 2) throw new CliError('unexpected_arguments', 'Unexpected positional arguments.');
    const state = stateStore.load();
    if (name === 'config show' || name === 'auth status') return { origin: state.origin || null, workspace: state.workspace || null, project: state.project || null, clientId: state.clientId || null, storedLogin: Boolean(state.accessToken), expired: state.expiresAt ? state.expiresAt <= Date.now() : null, scopes: state.scopes || [], environmentTokenPresent: Boolean(process.env.COLLAB_TOKEN) };
    return stateStore.exclusive(async (current, save) => {
      if (name === 'auth login') return login(options, current, save);
      if (name === 'auth refresh') return refresh(current, save);
      if (name === 'auth logout') { save({}); return { localCredentialsRemoved: true, serverRevocationConfirmed: false, next: 'Ask the deployment administrator to revoke the CLI token if it must stop working elsewhere.' }; }
      if (name === 'config set') {
        if (process.env.COLLAB_TOKEN) throw new CliError('environment_context', 'With COLLAB_TOKEN use COLLAB_WORKSPACE/COLLAB_PROJECT or per-command flags instead of saved context.');
        if (!options.workspace && !options.project) throw new CliError('missing_context', 'Supply --workspace ID and/or --project ID.');
        const selected = session(options, current);
        await request(selected.base, `/api/apps/auth/workspace?workspaceId=${encodeURIComponent(selected.workspace || '')}`, { token: selected.token });
        if (options.project) await request(selected.base, `/api/apps/auth/projects/${encodeURIComponent(options.project)}?workspaceId=${encodeURIComponent(selected.workspace || '')}`, { token: selected.token });
        save({ ...current, workspace: selected.workspace, project: options.project || (options.workspace ? undefined : current.project) });
        return { workspace: selected.workspace, project: options.project || null };
      }
      throw new CliError('unknown_command', 'Unknown local command. Run collab --help.');
    });
  }
  const spec = commands[name];
  if (!spec) throw new CliError('unknown_command', 'Unknown command. Run collab --help.');
  const args = words.slice(name.split(' ').length);
  const parameters = [...spec.path.matchAll(/:(\w+)/g)].map(m => m[1]);
  if (args.length !== parameters.length || args.some(a => !/^[a-zA-Z0-9_-]+$/.test(a))) throw new CliError('invalid_identifier', `Expected ${parameters.length} ID/key argument(s); only letters, digits, underscores and hyphens allowed.`);
  allowed(options, [...globals, ...Object.keys(spec.fields).map(flagName), ...Object.keys(spec.query).map(flagName), 'input', 'content-file', 'description-file', 'yes', 'dry-run', 'all']);
  if (options.all && !spec.pagination) throw new CliError('unsupported_pagination', '--all is supported only for issues, notes and worklogs lists.');
  if (spec.method === 'DELETE' && !options.yes) throw new CliError('confirmation_required', 'Deletion requires --yes.');
  const body = {};
  if (options.input) {
    if (!Object.keys(spec.fields).length) throw new CliError('invalid_input', 'This command does not accept a body.');
    let input; try { input = JSON.parse(await boundedInput(options.input)); } catch { throw new CliError('invalid_input', 'Expected a JSON object, at most 1 MiB.'); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CliError('invalid_input', 'Expected a JSON object.');
    for (const [key, value] of Object.entries(input)) {
      if (!Object.hasOwn(spec.fields, key)) throw new CliError('unknown_field', 'Input contains an unsupported field. See collab schema.');
      body[key] = value;
    }
  }
  for (const [key, type] of Object.entries(spec.fields)) if (options[flagName(key)] !== undefined) {
    if (Object.hasOwn(body, key)) throw new CliError('duplicate_field', 'Do not repeat a field in JSON and command flags.');
    body[key] = converted(options[flagName(key)], type);
  }
  for (const key of ['content', 'description']) if (options[`${key}-file`]) {
    if (!Object.hasOwn(spec.fields, key) || Object.hasOwn(body, key)) throw new CliError('invalid_input', 'Text file field is unsupported or duplicated.');
    body[key] = await boundedInput(options[`${key}-file`]);
  }
  for (const [key, value] of Object.entries(body)) {
    const type = spec.fields[key];
    if (value !== null && !(type === 'array' ? Array.isArray(value) && value.every(v => typeof v === 'string') : type === 'integer' ? Number.isSafeInteger(value) : typeof value === type)) throw new CliError('invalid_input', 'A JSON field has the wrong type.');
  }
  if (name.startsWith('notes ')) {
    if (body.type && ['ENV_VARS', 'API_KEYS', 'CREDENTIALS'].includes(body.type)) throw new CliError('unsupported_note_type', 'This CLI manages project context, not secret documents.');
    if (body.scope && !['WORKSPACE', 'PROJECT', 'PUBLIC'].includes(body.scope)) throw new CliError('unsupported_note_scope', 'Use WORKSPACE, PROJECT or PUBLIC for shared Notes.');
  }
  const state = stateStore.load(), selected = session(options, state);
  if (spec.defaultProject && !Object.hasOwn(body, 'projectId') && selected.project) body.projectId = selected.project;
  if (name === 'notes create' && body.projectId && !body.scope) body.scope = 'PROJECT';
  for (const key of spec.required || []) if (body[key] === undefined || body[key] === null || body[key] === '') throw new CliError('required_field', `Missing required --${flagName(key)}.`);
  if (['PATCH', 'PUT'].includes(spec.method) && !Object.keys(body).length) throw new CliError('empty_update', 'Supply at least one field to update.');
  const query = new URLSearchParams();
  if (selected.workspace) query.set('workspaceId', selected.workspace);
  for (const [key, type] of Object.entries(spec.query)) if (options[flagName(key)] !== undefined) query.set(key, String(converted(options[flagName(key)], type)));
  if (spec.query.projectId && !query.has('projectId') && selected.project) query.set('projectId', selected.project);
  for (const key of ['limit', 'page', 'offset']) if (query.has(key) && (Number(query.get(key)) < (key === 'offset' ? 0 : 1) || (key === 'limit' && Number(query.get(key)) > 100))) throw new CliError('invalid_pagination', 'Use limit 1..100, page >=1 and offset >=0.');
  let endpoint = spec.path; parameters.forEach((key, i) => { endpoint = endpoint.replace(`:${key}`, encodeURIComponent(args[i])); });
  const timeout = options.timeout === undefined ? 30000 : converted(options.timeout, 'integer') * 1000;
  if (timeout < 1000 || timeout > 120000) throw new CliError('invalid_timeout', 'Timeout must be 1..120 seconds.');
  const payload = Object.keys(spec.fields).length ? body : undefined;
  const apiPath = () => `/api/apps/auth/${endpoint}${query.size ? `?${query}` : ''}`;
  if (options['dry-run']) return { dryRun: true, method: spec.method, url: selected.base + apiPath(), body: payload };
  const send = async () => {
    const result = await request(selected.base, apiPath(), { token: selected.token, method: spec.method, body: payload, timeout });
    if (name === 'notes get' && ['ENV_VARS', 'API_KEYS', 'CREDENTIALS'].includes(result?.type)) throw new CliError('unsupported_note_type', 'Secret document output is not available through this CLI.', 4);
    return result;
  };
  if (!options.all) return send();
  const [key, mode] = spec.pagination; const collected = []; const seen = new Set();
  for (let i = 0; i < 100; i++) {
    const result = await send(), rows = result[key];
    if (!Array.isArray(rows)) throw new CliError('invalid_response', 'Unexpected pagination shape.', 5);
    for (const row of rows) if (!row.id || !seen.has(row.id)) { collected.push(row); if (row.id) seen.add(row.id); }
    if (collected.length > 10000) throw new CliError('pagination_limit', 'Result exceeds 10,000 items. Narrow the filters.', 5);
    if (mode === 'page' && (!Number.isSafeInteger(result.pagination?.page) || !Number.isSafeInteger(result.pagination?.pages))) throw new CliError('invalid_response', 'Missing pagination metadata.', 5);
    const more = mode === 'page' ? result.pagination.page < result.pagination.pages : result.hasMore ?? result.pagination?.hasMore;
    if (typeof more !== 'boolean') throw new CliError('invalid_response', 'Missing pagination metadata.', 5);
    if (!more) return { [key]: collected, count: collected.length, complete: true, snapshot: false };
    if (!rows.length) throw new CliError('invalid_response', 'Pagination did not advance.', 5);
    query.set(mode, String(mode === 'page' ? Number(query.get('page') || 1) + 1 : Number(query.get('offset') || 0) + rows.length));
  }
  throw new CliError('pagination_limit', 'Page limit reached. Narrow the filters; no partial success was emitted.', 5);
}

try { process.stdout.write(JSON.stringify(await main()) + '\n'); }
catch (error) {
  const safe = error instanceof CliError ? error : new CliError('local_error', 'Command could not complete. Local or remote error details were omitted.', 1);
  process.stderr.write(JSON.stringify({ error: safe.code, message: safe.message, ...safe.details }) + '\n');
  process.exitCode = safe.exit;
}
