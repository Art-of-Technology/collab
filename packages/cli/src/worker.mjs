import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { CliError, request, store } from './client.mjs';
import { claudeRunner } from './worker-runner.mjs';
import { workerService } from './worker-service.mjs';

export const workerCommands = Object.fromEntries(['setup', 'run', 'status', 'stop', 'doctor', 'install', 'uninstall'].map(command => [`worker ${command}`, `Dedicated managed worker ${command}; --agent NAME --workspace ID. See the worker guide.`]));
const fail = (code, message) => new CliError(code, message, 5);
const key = value => createHash('sha256').update(JSON.stringify(value)).digest('base64url');
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value);
export function workerKey(selected, userId, agent) { return key([selected.base, selected.workspace, userId, agent]); }
export function workerConfig(options, previous = {}) {
  const config = { ...previous };
  for (const [flag, field] of [['host', 'host'], ['cwd', 'cwd'], ['claude', 'executable'], ['model', 'model'], ['review-agent', 'reviewAgent']]) if (options[flag] !== undefined) config[field] = options[flag];
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(config.host || '') || !path.isAbsolute(config.cwd || '') || !path.isAbsolute(config.executable || '') ||
    !fs.statSync(config.cwd).isDirectory() || !fs.statSync(config.executable).isFile()) throw fail('worker_config', 'Supply --host, --cwd and an absolute trusted --claude executable.');
  if (config.model && !/^[a-zA-Z0-9._:-]{1,128}$/.test(config.model)) throw fail('worker_config', 'Invalid model.');
  if (config.reviewAgent && !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(config.reviewAgent)) throw fail('worker_config', 'Invalid review agent.');
  config.tools = options.tools === undefined ? previous.tools || ['Read', 'Glob', 'Grep'] : options.tools.split(',');
  if (!config.tools.length || config.tools.some(tool => !['Read', 'Glob', 'Grep', 'Edit', 'Write'].includes(tool))) throw fail('worker_config', 'Tools must be an explicit subset of Read,Glob,Grep,Edit,Write.');
  for (const [flag, field, fallback, min, max, integer] of [
    ['attempt-usd', 'attemptUSD', 0.5, 0.01, 10, false], ['daily-usd', 'dailyUSD', 2, 0.01, 100, false],
    ['timeout-seconds', 'timeoutSeconds', 900, 1, 3600, true], ['max-restarts', 'maxRestarts', 3, 0, 10, true],
    ['poll-seconds', 'pollSeconds', 5, 1, 60, true],
    ['max-starts', 'maxStarts', 20, 1, 200, true],
  ]) {
    const value = options[flag] === undefined ? previous[field] ?? fallback : Number(options[flag]);
    if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw fail('worker_config', `Invalid --${flag}; allowed ${min}..${max}.`);
    config[field] = value;
  }
  if (config.attemptUSD > config.dailyUSD) throw fail('worker_config', 'Attempt budget must fit the daily budget.');
  config.sessionId ||= randomUUID();
  return config;
}
export function budget(state, config, now = Date.now(), reserve = false) {
  if (now < (state.clock || 0)) throw fail('clock_rollback', 'Clock moved backwards; no new budget admitted. Correct the clock before restarting.');
  state.clock = now;
  const day = new Date(now).toISOString().slice(0, 10);
  state.usage ||= { day, chargedUSD: 0, reservedUSD: 0, estimatedUSD: 0, unknownUSD: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, restarts: 0, starts: 0, totalStarts: 0 };
  if (day > state.usage.day) { state.usage.day = day; state.usage.chargedUSD = 0; state.usage.starts = 0; }
  if (reserve) {
    if (state.usage.chargedUSD + config.attemptUSD > config.dailyUSD + 1e-9 || state.usage.starts >= (config.maxStarts ?? 20)) return false;
    state.usage.chargedUSD += config.attemptUSD; state.usage.reservedUSD += config.attemptUSD;
    state.usage.starts++; state.usage.totalStarts++;
  }
  return true;
}
function summary(state) {
  return { configured: !!state.config, config: state.config, state: state.status || 'stopped', runId: state.runId || null,
    taskId: state.active?.handoffId || null, attemptId: state.active?.attemptId || null, childSessionId: state.active?.sessionId || null,
    heartbeatAt: state.heartbeatAt || null, stopReason: state.stopReason || null, usage: state.usage || null,
    active: state.active ? { phase: state.active.phase, closed: state.active.closed === true, reservedUSD: state.active.reservedUSD } : null };
}
async function control(record, action) {
  if (!record.port || !record.nonce) return { online: false, stopped: true };
  try {
    const response = await fetch(`http://127.0.0.1:${record.port}/${action}`, { method: 'POST', headers: { authorization: `Bearer ${record.nonce}` }, signal: AbortSignal.timeout(action === 'stop' ? 15000 : 2000), redirect: 'error' });
    if (!response.ok) throw Error();
    const result = await response.json();
    if (result.nonce !== record.nonce) throw Error();
    return { online: action !== 'stop', stopped: result.stopped === true };
  } catch { if (action === 'stop') throw fail('stop_unconfirmed', 'Owned daemon closure could not be confirmed; no PID was signalled.'); return { online: false, stopped: false }; }
}
export async function runWorker(name, options, selected, userId, dependencies = {}) {
  if (!options.workspace || !selected.workspace || !selected.base || !identifier(userId) || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(options.agent || '')) throw fail('worker_context', 'Supply an explicit agent/workspace with a saved login identity.');
  const identity = workerKey(selected, userId, options.agent), stateStore = store(`worker-${identity}`), controlStore = store(`ctl-${identity}`);
  const runner = dependencies.runner || claudeRunner, now = dependencies.now || Date.now, sleep = dependencies.sleep || delay;
  const api = dependencies.api || ((endpoint, extra = {}) => request(selected.base, `/api/apps/auth/${endpoint}${endpoint.includes('?') ? '&' : '?'}workspaceId=${encodeURIComponent(selected.workspace)}`, { token: selected.token, ...extra }));
  const journal = handoffId => store(`job-${key([identity, handoffId])}`);
  if (name === 'worker status') return { ...summary(stateStore.load()), ...await control(controlStore.load(), 'status'), ...(dependencies.loginError && { liveHealth: { ok: false, error: dependencies.loginError } }), estimateWarning: 'Client cost estimates can exceed limits and differ from invoices.' };
  if (name === 'worker stop') {
    const record = controlStore.load(), state = stateStore.load();
    if (!record.port && ((state.active && state.active.closed !== true) || (state.runId && !state.closed))) throw fail('stop_unconfirmed', 'No live owned control endpoint can confirm closure. Inspect the saved session; no PID was signalled.');
    return control(record, 'stop');
  }
  return stateStore.exclusive(async (state, save) => {
    if (name === 'worker setup') {
      if (state.active || (state.runId && !state.closed)) throw fail('worker_uncertain', 'Reconcile the prior run through worker run/status before changing setup.');
      const config = workerConfig(options, state.config);
      await runner.doctor(config);
      const labelIds = options['label-ids'] === undefined ? undefined : JSON.parse(options['label-ids']);
      await api('agents/worker', { method: 'POST', body: { agent: options.agent, host: config.host, sessionId: config.sessionId, event: 'configure',
        ...(options['manage-existing'] && { convert: true }), ...(labelIds && { labelIds }) } });
      state.config = config; state.status = 'stopped'; save(state);
      return { ...summary(state), started: false };
    }
    if (!state.config) throw fail('worker_setup_required', 'Run worker setup first.');
    const config = workerConfig({}, state.config);
    if (name === 'worker doctor') return { ...await runner.doctor(config), ...summary(state), platform: process.platform };
    if (name === 'worker install' || name === 'worker uninstall') return workerService(name, identity, options, state, save, dependencies.service);
    if (name !== 'worker run') throw fail('unknown_command', 'Unknown worker command.');
    const controller = new AbortController(), stop = () => controller.abort();
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    let server, finish, admitted = false;
    const finished = new Promise(resolve => { finish = resolve; });
    const persist = () => { state.heartbeatAt = new Date(now()).toISOString(); save(state); };
    const report = (event, signal = controller.signal) => api('agents/worker', { method: 'POST', timeout: 5000, signal,
      body: { agent: options.agent, host: config.host, sessionId: config.sessionId, event, generation: state.runId,
        state: state.status, taskId: state.active?.handoffId || null, ...(state.usage && { usage: state.usage }) } });
    const writeJob = () => journal(state.active.handoffId).exclusive((_old, write) => write(state.active));
    const restart = () => {
      state.restarts = (state.restarts || []).filter(at => at > now() - 3600000);
      if (state.restarts.length >= config.maxRestarts) throw fail('restart_limit', 'Automatic restart allowance exhausted; inspect worker status.');
      state.restarts.push(now()); state.usage.restarts = state.restarts.length; persist();
    };
    const action = (handoffId, action, content) => api(`agents/handoffs/${encodeURIComponent(handoffId)}`, { method: 'PATCH', signal: controller.signal,
      body: { agent: options.agent, generation: state.runId, action, ...(content && { content }) } });
    const get = handoffId => api(`agents/handoffs/${encodeURIComponent(handoffId)}?agent=${encodeURIComponent(options.agent)}`, { signal: controller.signal });
    try {
      budget(state, config, now()); persist();
      if (state.active && !state.active.closed) throw fail('worker_uncertain', 'Prior child closure is unproven. Inspect the saved child session; do not clear the journal or start another model.');
      if (state.active && !['reserved', 'result'].includes(state.active.phase)) throw fail('worker_uncertain', 'This task requires operator reconciliation; its recorded usage remains charged.');
      await runner.doctor(config);
      if (state.runId && !state.closed) {
        const remote = (await api('agents')).agents?.find(agent => agent.name === options.agent)?.worker;
        if (remote?.generation === state.runId) await report('close', null);
        else if (!remote?.closed) throw fail('worker_uncertain', 'Remote run ownership is unresolved.');
        state.closed = true; persist();
      }
      if (state.runId) restart();
      state.runId = randomUUID(); state.closed = false; state.status = 'idle'; state.stopReason = null; persist();
      await report('start'); admitted = true;
      const nonce = randomUUID();
      server = createServer(async (req, res) => {
        if (req.method !== 'POST' || req.headers.authorization !== `Bearer ${nonce}` || !['/stop', '/status'].includes(req.url)) { res.writeHead(403); res.end(); return; }
        if (req.url === '/stop') { stop(); await finished; }
        res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ nonce, stopped: req.url === '/stop' }));
      });
      server.listen(0, '127.0.0.1'); await once(server, 'listening');
      await controlStore.exclusive((_old, write) => write({ port: server.address().port, nonce }));
      let failures = 0;
      while (!controller.signal.aborted) {
        try {
          budget(state, config, now());
          state.status = 'idle'; persist(); await report('renew');
          if (!state.active) {
            const queues = [];
            for (const type of ['claimed', 'unseen']) {
              const result = await api(`agents/inbox?agent=${encodeURIComponent(options.agent)}&state=${type}&limit=50`, { signal: controller.signal });
              if (!Array.isArray(result.items) || result.items.length > 50 || result.items.some(row => !identifier(row.id))) throw fail('invalid_response', 'Invalid bounded inbox.');
              for (const item of result.items) {
                if (type === 'unseen' && (['completed', 'superseded'].includes(item.status) || (item.status === 'claimed' && item.claimedBy?.name !== options.agent))) {
                  await action(item.id, 'seen');
                } else queues.push(item);
              }
            }
            const item = queues.find(row => {
              if (!['open', 'claimed'].includes(row.status)) return false;
              const previous = journal(row.id).load();
              return previous.phase !== 'completed' || previous.revision !== row.updatedAt;
            });
            if (!item) { failures = 0; await sleep(config.pollSeconds * 1000, undefined, { signal: controller.signal }); continue; }
            const previous = journal(item.id).load();
            if (previous.phase && previous.phase !== 'completed') { state.active = previous; persist(); throw fail('worker_uncertain', 'A retained journal prevents duplicate execution.'); }
            if (previous.phase === 'completed' && previous.revision === item.updatedAt) { await sleep(config.pollSeconds * 1000, undefined, { signal: controller.signal }); continue; }
            if (!budget(state, config, now(), true)) { state.status = 'usage-limit'; persist(); await report('renew'); await sleep(config.pollSeconds * 1000, undefined, { signal: controller.signal }); continue; }
            state.active = { handoffId: item.id, revision: item.updatedAt, phase: 'reserved', closed: true, attemptId: randomUUID(), sessionId: randomUUID(), reservedUSD: config.attemptUSD, day: state.usage.day };
            persist(); await writeJob();
          }
          const job = state.active;
          const { handoff } = await get(job.handoffId);
          if (!handoff || handoff.id !== job.handoffId) throw fail('invalid_response', 'Invalid handoff.');
          if (handoff.status === 'completed' && job.phase === 'result') {
            job.phase = 'completed'; await writeJob(); delete state.active; persist(); continue;
          }
          if (!['open', 'claimed'].includes(handoff.status)) throw fail('worker_uncertain', 'Work changed; do not repeat it.');
          if (job.phase !== 'result') {
            try { await action(job.handoffId, 'claim'); }
            catch (error) {
              if (error.code !== 'already_claimed') throw error;
              state.usage.reservedUSD = Math.max(0, state.usage.reservedUSD - job.reservedUSD);
              if (job.day === state.usage.day) state.usage.chargedUSD = Math.max(0, state.usage.chargedUSD - job.reservedUSD);
              job.phase = 'completed'; await writeJob(); delete state.active; persist();
              await action(job.handoffId, 'seen'); continue;
            }
            const issue = await api(`issues/${encodeURIComponent(handoff.issueId)}`, { signal: controller.signal });
            const context = { handoff: { id: handoff.id, content: handoff.content, issueId: handoff.issueId }, issue, reviewAgent: config.reviewAgent || null };
            if (Buffer.byteLength(JSON.stringify(context)) > 44000) throw fail('worker_context_limit', 'Task context exceeds the bounded runner input.');
            job.phase = 'dispatching'; job.closed = false; persist(); await writeJob();
            const childController = new AbortController();
            const childSignal = AbortSignal.any([controller.signal, childController.signal]);
            let settled = false, heartbeatError;
            const execution = runner.execute(config, job, context, childSignal, () => { state.status = 'working'; job.phase = 'dispatched'; persist(); });
            const pulse = (async () => {
              while (!settled && !childSignal.aborted) {
                try { await sleep(10000, undefined, { signal: childSignal }); if (!settled) { persist(); await report('renew', childSignal); } }
                catch (error) { if (!settled && !childSignal.aborted) { heartbeatError = error; childController.abort(); } break; }
              }
            })();
            let result;
            try { result = await execution; }
            catch (error) { job.phase = 'uncertain'; state.usage.unknownUSD += job.reservedUSD; throw error; }
            finally { settled = true; childController.abort(); await pulse; job.closed = true; persist(); await writeJob(); }
            if (heartbeatError) throw heartbeatError;
            state.usage.reservedUSD -= job.reservedUSD;
            if (job.day === state.usage.day) state.usage.chargedUSD += result.estimatedUSD - job.reservedUSD;
            state.usage.estimatedUSD += result.estimatedUSD;
            for (const [token, value] of Object.entries(result.tokens)) state.usage[token] += value;
            if (result.error) {
              if (result.errorCode) { job.phase = 'blocked'; persist(); await writeJob(); throw fail(result.errorCode, 'Provider stopped this attempt. Inspect usage and the saved session before resuming.'); }
              if (config.tools.some(tool => ['Edit', 'Write'].includes(tool))) { job.phase = 'blocked'; persist(); await writeJob(); throw fail('worker_uncertain', 'Failed writable attempt requires reconciliation.'); }
              job.phase = 'blocked'; persist(); await writeJob(); restart();
              await sleep(Math.min(30000, 1000 * 2 ** state.restarts.length), undefined, { signal: controller.signal });
              if (!budget(state, config, now(), true)) { job.phase = 'blocked'; persist(); await writeJob(); throw fail('usage_limit', 'Retry budget exhausted.'); }
              Object.assign(job, { phase: 'reserved', attemptId: randomUUID(), sessionId: randomUUID(), day: state.usage.day }); persist(); await writeJob(); continue;
            }
            job.phase = 'result'; job.result = result; persist(); await writeJob();
          }
          const result = job.result;
          const content = `${result.content}\n\nWorker attempt: ${job.attemptId}`;
          if (result.outcome === 'review') await api('agents/handoffs', { method: 'POST', signal: controller.signal,
            body: { agent: options.agent, generation: state.runId, issue: handoff.issueId, afterId: job.handoffId, content, toAgents: [config.reviewAgent], requestId: job.attemptId } });
          else await action(job.handoffId, result.outcome === 'complete' ? 'complete' : 'progress', content);
          job.phase = result.outcome === 'blocked' ? 'blocked' : 'completed'; await writeJob();
          if (job.phase === 'blocked') throw fail('worker_uncertain', 'Worker reported an authority or task blocker; inspect the Collab progress entry.');
          delete state.active; persist(); failures = 0;
        } catch (error) {
          if (controller.signal.aborted) break;
          if (!state.active || ['reserved', 'result'].includes(state.active.phase)) {
            if (['transport_failed', 'server_error', 'rate_limited'].includes(error.code) && failures++ < 3) {
              state.status = 'retrying'; persist(); await sleep(Math.min(30000, 1000 * 2 ** failures), undefined, { signal: controller.signal }); continue;
            }
          }
          throw error;
        }
      }
      state.status = state.active?.phase === 'uncertain' ? 'uncertain' : 'stopped';
      state.stopReason ||= state.active?.phase === 'uncertain' ? 'interrupted_attempt' : 'requested_stop';
    } catch (error) {
      state.stopReason = typeof error.code === 'string' && /^[a-z_]{1,64}$/.test(error.code) ? error.code : 'worker_failed';
      state.status = ['unauthorized', 'token_expired', 'needs_login'].includes(error.code) ? 'needs-login' : error.code === 'restart_limit' ? 'restart-limit' : error.code === 'usage_limit' ? 'usage-limit' : state.active ? 'uncertain' : 'config';
    } finally {
      if (admitted && state.active?.closed !== false) {
        try { await report('close', null); state.closed = true; } catch { state.closed = false; state.stopReason ||= 'closure_unconfirmed'; }
      }
      persist(); finish();
      if (server) { await new Promise(resolve => server.close(resolve)); await controlStore.exclusive((_old, write) => write({})); }
      process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    }
    return summary(state);
  });
}
