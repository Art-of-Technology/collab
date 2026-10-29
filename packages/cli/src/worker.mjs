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
export function recoverableReservation(selected, userId, agent, taskId, state) {
  const active = state.active;
  if (!state.closed || !active || active.handoffId !== taskId || active.closed !== true || !['reserved', 'claimed'].includes(active.phase) || !identifier(active.attemptId) || !identifier(active.sessionId) || !Number.isFinite(active.reservedUSD) || active.reservedUSD <= 0 || typeof active.day !== 'string') return false;
  const saved = store(`job-${key([workerKey(selected, userId, agent), taskId])}`).load();
  return saved.handoffId === taskId && saved.attemptId === active.attemptId && saved.sessionId === active.sessionId && saved.phase === active.phase && saved.reservedUSD === active.reservedUSD && saved.day === active.day && saved.revision === active.revision && saved.closed === true;
}
export function workerConfig(options, previous = {}) {
  const config = { ...previous };
  for (const [flag, field] of [['host', 'host'], ['cwd', 'cwd'], ['claude', 'executable'], ['model', 'model'], ['review-agent', 'reviewAgent']]) if (options[flag] !== undefined) config[field] = options[flag];
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(config.host || '') || !path.isAbsolute(config.cwd || '') || !path.isAbsolute(config.executable || '') ||
    !fs.statSync(config.cwd, { throwIfNoEntry: false })?.isDirectory() || !fs.statSync(config.executable, { throwIfNoEntry: false })?.isFile()) throw fail('worker_config', 'Supply --host, --cwd and an absolute trusted --claude executable.');
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
  return { configured: !!state.config, setupPending: !!state.configure, config: state.config, state: state.status || 'stopped', runId: state.runId || null,
    taskId: state.active?.handoffId || null, attemptId: state.active?.attemptId || null, childSessionId: state.active?.sessionId || null,
    heartbeatAt: state.heartbeatAt || null, stopReason: state.stopReason || null, usage: state.usage || null,
    active: state.active ? { phase: state.active.phase, closed: state.active.closed === true, reservedUSD: state.active.reservedUSD } : null };
}
const transient = error => ['transport_failed', 'server_error', 'rate_limited'].includes(error.code);
function pause(state, error) {
  state.stopReason = typeof error.code === 'string' && /^[a-z_]{1,64}$/.test(error.code) ? error.code : 'worker_failed';
  state.status = ['unauthorized', 'token_expired', 'needs_login', 'login_required'].includes(error.code) ? 'needs-login' : error.code === 'restart_limit' ? 'restart-limit' : error.code === 'usage_limit' ? 'usage-limit' : state.active ? 'uncertain' : transient(error) ? 'retrying' : 'config';
}
export async function control(record, action) {
  if (!record.port || !record.nonce) return { online: false, stopped: false };
  try {
    const response = await fetch(`http://127.0.0.1:${record.port}/${action}`, { method: 'POST', headers: { authorization: `Bearer ${record.nonce}` }, signal: AbortSignal.timeout(action === 'stop' ? 15000 : 2000), redirect: 'error' });
    if (!response.ok) throw Error();
    const result = await response.json();
    if (result.nonce !== record.nonce) throw Error();
    return { online: action !== 'stop', stopped: result.stopped === true };
  } catch { return { online: false, stopped: false }; }
}
export async function runWorker(name, options, selected, userId, dependencies = {}) {
  if (!options.workspace || !selected.workspace || !selected.base || !identifier(userId) || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(options.agent || '')) throw fail('worker_context', 'Supply an explicit agent/workspace with a saved login identity.');
  const identity = workerKey(selected, userId, options.agent), stateStore = store(`worker-${identity}`), controlStore = store(`ctl-${identity}`);
  const runner = dependencies.runner || claudeRunner, now = dependencies.now || Date.now, sleep = dependencies.sleep || delay;
  const api = dependencies.api || ((endpoint, extra = {}) => request(selected.base, `/api/apps/auth/${endpoint}${endpoint.includes('?') ? '&' : '?'}workspaceId=${encodeURIComponent(selected.workspace)}`, { token: selected.token, ...extra }));
  const journal = handoffId => store(`job-${key([identity, handoffId])}`);
  if (name === 'worker status' || name === 'worker stop') {
    if (name === 'worker stop') {
      const requested = randomUUID(), deadline = Date.now() + 2000;
      for (;;) {
        try { await controlStore.exclusive((current, save) => save({ ...current, stopRequested: requested })); break; }
        catch (error) {
          if (error.code !== 'state_locked') throw error;
          if (Date.now() >= deadline) throw fail('stop_unconfirmed', 'Could not record the stop request; inspect the worker and retry.');
          await delay(20);
        }
      }
    }
    let health = await control(controlStore.load(), name === 'worker stop' ? 'stop' : 'status');
    let state = stateStore.load();
    if (!health.online && !health.stopped) {
      try {
        await stateStore.exclusive((current, save) => {
          state = current;
          if ((state.active && state.active.closed !== true) || (state.runId && !state.closed)) throw fail('stop_unconfirmed', 'Prior worker closure is unresolved. Inspect worker status and the saved session.');
          if (name === 'worker stop') { state.stopReason = 'requested_stop'; state.status = 'stopped'; save(state); }
        });
        health = { online: false, stopped: true };
      } catch (error) {
        if (!['state_locked', 'stop_unconfirmed'].includes(error.code)) throw error;
        if (name === 'worker stop') throw fail('stop_unconfirmed', 'Owned worker closure is unconfirmed. Retry worker stop after startup; inspect worker status if it remains unavailable. No PID was signalled.');
        state = { ...state, status: error.code === 'state_locked' && !state.runId ? 'starting' : 'uncertain', stopReason: 'stop_unconfirmed' };
      }
    }
    if (name === 'worker stop') return health;
    return { ...summary(state), ...health, ...(dependencies.loginError && { liveHealth: { ok: false, error: dependencies.loginError } }), estimateWarning: 'Client cost estimates can exceed limits and differ from invoices.' };
  }
  return stateStore.exclusive(async (state, save) => {
    if (name === 'worker run' && options['service-id'] && (!state.service || state.service.retired || state.service.installationId !== options['service-id'])) {
      return { ...summary(state), state: 'stopped', stopReason: 'service_retired' };
    }
    if (name === 'worker setup') {
      const retained = state.active && recoverableReservation(selected, userId, options.agent, state.active.handoffId, state);
      if (state.active && !retained || (state.runId && !state.closed)) throw fail('worker_uncertain', 'Reconcile the prior run through worker run/status before changing setup.');
      if (state.service) throw fail('worker_service', 'Uninstall the owned service before changing setup.');
      const stopRequest = controlStore.load().stopRequested;
      const config = workerConfig(options, state.configure?.config || state.config);
      if (retained && (JSON.stringify(config) !== JSON.stringify(state.config) || options['label-ids'] !== undefined || options['manage-existing'])) throw fail('worker_uncertain', 'Keep the worker configuration unchanged until the retained task is resolved.');
      await runner.doctor(config);
      const labelIds = options['label-ids'] === undefined ? undefined : JSON.parse(options['label-ids']);
      const body = { agent: options.agent, host: config.host, sessionId: config.sessionId, event: 'configure',
        ...(options['manage-existing'] && { convert: true }), ...(labelIds && { labelIds }) };
      if (state.configure?.body && (JSON.stringify(state.configure.config) !== JSON.stringify(config) || JSON.stringify(state.configure.body) !== JSON.stringify(body))) {
        throw fail('worker_setup_pending', 'Retry setup with the same options to reconcile its saved configuration intent.');
      }
      state.configure = { config, body }; state.status = 'config'; state.stopReason = 'configure_unconfirmed'; save(state);
      try { await api('agents/worker', { method: 'POST', body }); }
      catch (error) {
        if (error.details?.configureRejected === true) {
          delete state.configure.body; state.stopReason = 'configure_rejected'; save(state);
        }
        throw error;
      }
      state.config = config; delete state.configure; state.status = 'stopped'; state.stopReason = null; save(state);
      await controlStore.exclusive((current, write) => write({ ...current, stopRequested: current.stopRequested === stopRequest ? false : current.stopRequested }));
      return { ...summary(state), started: false };
    }
    if (name === 'worker uninstall') return workerService(name, identity, options, state, save, dependencies.service);
    let config;
    try {
      if (dependencies.startupError) throw dependencies.startupError;
      if (state.configure) throw fail('worker_setup_pending', 'Retry the pending worker setup before running.');
      if (!state.config) throw fail('worker_setup_required', 'Run worker setup first.');
      config = workerConfig({}, state.config);
    } catch (error) {
      if (name !== 'worker run') throw error;
      pause(state, error); save(state); return summary(state);
    }
    if (name === 'worker doctor') return { ...await runner.doctor(config), ...summary(state), platform: process.platform };
    if (name === 'worker install') return workerService(name, identity, options, state, save, dependencies.service);
    if (name !== 'worker run') throw fail('unknown_command', 'Unknown worker command.');
    if (controlStore.load().stopRequested || state.stopReason === 'requested_stop') return { ...summary(state), state: 'stopped', stopReason: 'requested_stop' };
    if (dependencies.task && (!identifier(dependencies.task.id) || !identifier(dependencies.task.project))) throw fail('worker_context', 'Invalid coordinator task binding.');
    if (dependencies.task && state.active && state.active.handoffId !== dependencies.task.id) throw fail('worker_uncertain', 'A different task still owns this worker.');
    const controller = new AbortController(), stop = () => controller.abort();
    dependencies.signal?.throwIfAborted();
    dependencies.signal?.addEventListener('abort', stop, { once: true });
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    const renewalController = new AbortController();
    let server, finish, renewal, renewalError, fatalError, admitted = false;
    const finished = new Promise(resolve => { finish = resolve; });
    const persist = () => { state.heartbeatAt = new Date(now()).toISOString(); save(state); };
    const stopped = () => {
      state.status = state.active && !['reserved', 'claimed', 'result', 'completed'].includes(state.active.phase) ? 'uncertain' : 'stopped';
      state.stopReason = state.status === 'uncertain' ? 'interrupted_attempt' : controlStore.load().stopRequested ? 'requested_stop' : 'interrupted';
    };
    const retry = async (operation, signal, lease = false) => {
      for (let attempt = 0; ; attempt++) {
        signal?.throwIfAborted();
        try { return await operation(); }
        catch (error) {
          if (signal?.aborted || !(transient(error) || (lease && error.code === 'outcome_unknown')) || attempt >= 3) throw error;
          await sleep(1000 * 2 ** attempt, undefined, { signal: signal || undefined });
        }
      }
    };
    const read = endpoint => retry(() => api(endpoint, { signal: controller.signal }), controller.signal);
    const report = (event, signal = controller.signal) => {
      const body = { agent: options.agent, host: config.host, sessionId: config.sessionId, event, generation: state.runId,
        state: state.status, taskId: state.active?.handoffId || null, ...(dependencies.coordinator && { coordinator: { project: dependencies.coordinator.project, generation: dependencies.coordinator.generation } }), ...(state.usage && { usage: { ...state.usage } }) };
      return retry(() => api('agents/worker', { method: 'POST', timeout: 5000, signal, body }), signal, true);
    };
    const writeJob = () => journal(state.active.handoffId).exclusive((_old, write) => write(state.active));
    const restart = () => {
      state.restarts = (state.restarts || []).filter(at => at > now() - 3600000);
      if (state.restarts.length >= config.maxRestarts) throw fail('restart_limit', 'Automatic restart allowance exhausted; inspect worker status.');
      state.restarts.push(now()); state.usage.restarts = state.restarts.length; persist();
    };
    const action = (handoffId, action, content) => api(`agents/handoffs/${encodeURIComponent(handoffId)}`, { method: 'PATCH', signal: controller.signal,
      body: { agent: options.agent, generation: state.runId, action, ...(dependencies.coordinator && action === 'claim' && { coordinator: { project: dependencies.coordinator.project, generation: dependencies.coordinator.generation } }), ...(content && { content }) } });
    const get = handoffId => read(`agents/handoffs/${encodeURIComponent(handoffId)}?agent=${encodeURIComponent(options.agent)}`);
    try {
      budget(state, config, now());
      if ((state.daemonStartedAt || state.runId) && !(state.closed && state.stopReason === 'coordinator_complete' && !state.active)) restart();
      state.daemonStartedAt = now(); persist();
      if (state.active && !state.active.closed) throw fail('worker_uncertain', 'Prior child closure is unproven. Inspect the saved child session; do not clear the journal or start another model.');
      if (state.active && !['reserved', 'claimed', 'result', 'settling', 'completed'].includes(state.active.phase)) throw fail('worker_uncertain', 'This task requires operator reconciliation; its recorded usage remains charged.');
      await runner.doctor(config);
      if (state.runId && !state.closed) {
        const remote = (await read(`agents/worker?agent=${encodeURIComponent(options.agent)}`)).agent?.worker;
        if (remote?.generation === state.runId) await report('close', null);
        else if (!remote?.closed) throw fail('worker_uncertain', 'Remote run ownership is unresolved.');
        state.closed = true; persist();
      }
      state.runId = randomUUID(); state.closed = false; state.status = 'idle'; state.stopReason = null; persist();
      admitted = true; await report('start');
      const renewalSignal = AbortSignal.any([controller.signal, renewalController.signal]);
      renewal = (async () => {
        try {
          while (!renewalSignal.aborted) {
            await sleep(10000, undefined, { signal: renewalSignal });
            renewalSignal.throwIfAborted();
            persist(); await report('renew', renewalSignal);
          }
        } catch (error) {
          if (!renewalSignal.aborted) { renewalError = error; controller.abort(error); }
        }
      })();
      const nonce = randomUUID();
      server = createServer(async (req, res) => {
        if (req.method !== 'POST' || req.headers.authorization !== `Bearer ${nonce}` || !['/stop', '/status'].includes(req.url)) { res.writeHead(403); res.end(); return; }
        if (req.url === '/stop') { stop(); await finished; }
        res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ nonce, stopped: req.url === '/stop' && state.closed === true && state.active?.closed !== false }));
      });
      server.listen(0, '127.0.0.1'); await once(server, 'listening');
      await controlStore.exclusive((old, write) => { if (old.stopRequested) stop(); write({ ...old, port: server.address().port, nonce }); });
      while (!controller.signal.aborted) {
        budget(state, config, now());
        state.status = 'idle'; persist();
        if (!state.active) {
          const queues = [];
          if (dependencies.task) {
            const { handoff } = await get(dependencies.task.id);
            if (handoff?.issue?.projectId !== dependencies.task.project) throw fail('worker_context', 'Coordinator task is outside its project.');
            if (['completed', 'superseded'].includes(handoff.status)) break;
            queues.push(handoff);
          }
          for (const type of dependencies.task ? [] : ['claimed', 'unseen']) {
            const result = await read(`agents/inbox?agent=${encodeURIComponent(options.agent)}&state=${type}&limit=50`);
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
          if (!item && dependencies.task) break;
          if (!item) { await sleep(config.pollSeconds * 1000, undefined, { signal: controller.signal }); continue; }
          const previous = journal(item.id).load();
          if (previous.phase && previous.phase !== 'completed') { state.active = previous; persist(); throw fail('worker_uncertain', 'A retained journal prevents duplicate execution.'); }
          if (!budget(state, config, now(), true)) {
            state.status = 'usage-limit'; persist();
            if (dependencies.task) throw fail('usage_limit', 'Worker budget cannot admit this task.');
            await sleep(config.pollSeconds * 1000, undefined, { signal: controller.signal }); continue;
          }
          state.active = { handoffId: item.id, revision: item.updatedAt, phase: 'reserved', closed: true, attemptId: randomUUID(), sessionId: randomUUID(), reservedUSD: config.attemptUSD, day: state.usage.day };
          persist(); await writeJob();
        }
        const job = state.active;
        const { handoff } = await get(job.handoffId);
        if (!handoff || handoff.id !== job.handoffId) throw fail('invalid_response', 'Invalid handoff.');
        let ownedClaim = false;
        if (handoff.status === 'claimed' && ['claimed', 'reserved'].includes(job.phase)) {
          const { agent } = await read(`agents/worker?agent=${encodeURIComponent(options.agent)}`);
          if (!identifier(agent?.id) || agent.name !== options.agent || agent.host !== config.host || agent.sessionId !== config.sessionId || !identifier(handoff.claimedById)) throw fail('worker_uncertain', 'The claim or worker identity cannot be verified.');
          ownedClaim = handoff.claimedById === agent.id;
        }
        if (job.phase === 'claimed' && (dependencies.task && handoff.issue?.projectId !== dependencies.task.project || handoff.status !== 'claimed' || !ownedClaim)) throw fail('worker_uncertain', 'The retained claim no longer belongs to this worker.');
        if (job.phase === 'reserved' && handoff.status !== 'open' && ownedClaim) throw fail('worker_uncertain', 'The retained reservation does not prove this claim.');
        if (job.phase === 'completed' || (handoff.status === 'completed' && ['result', 'settling'].includes(job.phase))) {
          job.phase = 'completed'; await writeJob(); delete state.active; persist(); continue;
        }
        if (job.phase === 'settling') throw fail('worker_uncertain', 'Prior result settlement is unconfirmed; inspect Collab before retrying.');
        if (!['open', 'claimed'].includes(handoff.status)) throw fail('worker_uncertain', 'Work changed; do not repeat it.');
        if (job.phase !== 'result') {
          if (job.phase === 'reserved') {
            job.phase = 'claiming'; persist(); await writeJob();
            try { await action(job.handoffId, 'claim'); }
            catch (error) {
              if (error.code !== 'already_claimed') throw error;
              state.usage.reservedUSD = Math.max(0, state.usage.reservedUSD - job.reservedUSD);
              if (job.day === state.usage.day) state.usage.chargedUSD = Math.max(0, state.usage.chargedUSD - job.reservedUSD);
              job.phase = 'completed'; await writeJob(); delete state.active; persist();
              await action(job.handoffId, 'seen'); if (dependencies.task) break; continue;
            }
            job.phase = 'claimed'; persist(); await writeJob();
          }
          const issue = await read(`issues/${encodeURIComponent(handoff.issueId)}`);
          if (dependencies.task && issue.project?.id !== dependencies.task.project) throw fail('worker_context', 'Task project changed before model dispatch.');
          const context = { handoff: { id: handoff.id, content: handoff.content, issueId: handoff.issueId }, issue, reviewAgent: config.reviewAgent || null };
          if (Buffer.byteLength(JSON.stringify(context)) > 44000) throw fail('worker_context_limit', 'Task context exceeds the bounded runner input.');
          let result, execution;
          await controlStore.exclusive(async current => {
            if (current.stopRequested) { stop(); controller.signal.throwIfAborted(); }
            controller.signal.throwIfAborted();
            job.phase = 'dispatching'; job.closed = false; persist(); await writeJob();
            execution = runner.execute(config, job, context, controller.signal, () => { state.status = 'working'; job.phase = 'dispatched'; persist(); }).then(value => ({ value }), error => ({ error }));
          });
          try {
            const outcome = await execution;
            if (outcome.error) throw outcome.error;
            result = outcome.value;
          } catch (error) {
            job.phase = 'uncertain'; state.usage.unknownUSD += job.reservedUSD; throw error;
          } finally { job.closed = true; persist(); await writeJob(); }
          state.usage.reservedUSD -= job.reservedUSD;
          if (job.day === state.usage.day) state.usage.chargedUSD += result.estimatedUSD - job.reservedUSD;
          state.usage.estimatedUSD += result.estimatedUSD;
          for (const [token, value] of Object.entries(result.tokens)) state.usage[token] += value;
          if (result.error) {
            job.phase = 'blocked'; persist(); await writeJob();
            throw fail(result.errorCode || 'provider_error', 'Provider stopped this attempt. Inspect usage and the saved session before resuming.');
          }
          job.phase = 'result'; job.result = result; persist(); await writeJob();
        }
        const result = job.result;
        const content = `${result.content}\n\nWorker attempt: ${job.attemptId}`;
        controller.signal.throwIfAborted();
        job.phase = 'settling'; persist(); await writeJob();
        if (result.outcome === 'review') await api('agents/handoffs', { method: 'POST', signal: controller.signal,
          body: { agent: options.agent, generation: state.runId, issue: handoff.issueId, afterId: job.handoffId, content, toAgents: [config.reviewAgent], requestId: job.attemptId } });
        else await action(job.handoffId, result.outcome === 'complete' ? 'complete' : 'progress', content);
        job.phase = result.outcome === 'blocked' ? 'blocked' : 'completed'; await writeJob();
        if (job.phase === 'blocked') throw fail('worker_uncertain', 'Worker reported an authority or task blocker; inspect the Collab progress entry.');
        delete state.active; persist();
        if (dependencies.task) break;
      }
      if (renewalError) throw renewalError;
      stopped();
      if (dependencies.task && !state.active && !controller.signal.aborted) state.stopReason = 'coordinator_complete';
    } catch (error) {
      if (controller.signal.aborted && !renewalError) {
        stopped();
      } else {
        error = renewalError || error;
        pause(state, error);
        if (transient(error) && dependencies.task && recoverableReservation(selected, userId, options.agent, dependencies.task.id, { ...state, closed: true })) state.status = 'retrying';
        if (transient(error) || error.code === 'outcome_unknown' && !state.active || !(error instanceof CliError) && !error.code) fatalError = error;
      }
    } finally {
      renewalController.abort(); await renewal;
      if (admitted && state.active?.closed !== false) {
        try { await report('close', null); state.closed = true; } catch { state.closed = false; state.stopReason ||= 'closure_unconfirmed'; }
      }
      persist(); finish();
      if (server) { await new Promise(resolve => server.close(resolve)); await controlStore.exclusive((old, write) => write({ stopRequested: old.stopRequested || false })); }
      process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
      dependencies.signal?.removeEventListener('abort', stop);
    }
    if (fatalError) throw fatalError;
    return summary(state);
  });
}
