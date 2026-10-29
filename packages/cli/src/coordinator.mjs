import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { CliError, request, store } from './client.mjs';
import { runWorker, workerKey, control } from './worker.mjs';
import { workerService } from './worker-service.mjs';

export const coordinatorCommands = Object.fromEntries(['setup', 'run', 'status', 'stop', 'install', 'uninstall'].map(action =>
  [`coordinator ${action}`, 'Project coordinator; explicit --agent NAME --workspace ID --project ID. setup requires --workers NAME[,NAME].']));
const fail = (code, message) => new CliError(code, message, 5);
const hash = values => createHash('sha256').update(JSON.stringify(values)).digest('base64url');
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const safeReasons = new Set([null, 'coordinator_complete', 'transport_failed', 'server_error', 'rate_limited']);

// A heartbeat proves liveness, not meaningful task progress. Never infer closure from age.
export function classifyTask(task, agents, config, now) {
  const age = now - Date.parse(task.status === 'claimed' ? task.updatedAt : task.createdAt);
  if (!Number.isFinite(age) || age < 0) return { reason: 'invalid_timestamp', action: 'blocked' };
  if (task.status === 'claimed') {
    const claimed = agents.find(a => a.id === task.claimedBy?.id)?.managedWorker;
    const reason = claimed && !claimed.closed && !(Date.parse(claimed.leaseUntil) > now) ? 'stale_heartbeat' : age >= config.stallSeconds * 1000 ? 'progress_overdue' : 'working';
    return { reason, action: 'observe', agent: task.claimedBy?.name };
  }
  const matches = agents.filter(a => task.recipientNames.includes(a.name) || a.labelIds.some(label => task.labelIds.includes(label)));
  const worker = matches.find(a => a.owned && config.workers.includes(a.name) && a.managedWorker);
  if (!worker) return { reason: 'no_execution_route', action: 'blocked' };
  const state = worker.managedWorker;
  if (['config', 'uncertain', 'needs-login', 'usage-limit', 'restart-limit'].includes(state.state)) return { reason: state.state, action: 'blocked', agent: worker.name };
  if (!state.closed) return { reason: Date.parse(state.leaseUntil) > now ? (state.state === 'working' ? 'busy' : 'healthy_idle') : 'stale_heartbeat', action: 'observe', agent: worker.name };
  if (age < config.overdueSeconds * 1000) return { reason: 'waiting', action: 'observe', agent: worker.name };
  return { reason: 'overdue', action: 'dispatch', agent: worker.name };
}

export async function runCoordinator(name, options, selected, userId, deps = {}) {
  if (!identifier(userId) || !identifier(options.workspace) || !identifier(options.project) || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(options.agent || '')) throw fail('coordinator_context', 'Supply your registered agent, explicit workspace and project.');
  const identity = hash([selected.base, options.workspace, options.project, userId, options.agent]);
  const disk = store(`coord-${identity}`), controls = store(`cctl-${identity}`);
  const now = deps.now || Date.now, sleep = deps.sleep || delay;
  const api = deps.api || ((endpoint, extra = {}) => request(selected.base, `/api/apps/auth/${endpoint}${endpoint.includes('?') ? '&' : '?'}workspaceId=${encodeURIComponent(options.workspace)}`, { token: selected.token, ...extra }));
  const worker = deps.worker || runWorker;
  if (name === 'coordinator status' || name === 'coordinator stop') {
    const health = await control(controls.load(), name.endsWith('stop') ? 'stop' : 'status');
    if (name.endsWith('stop') && !health.stopped) {
      await disk.exclusive((state, save) => { state.paused = true; state.status = 'paused'; save(state); });
    }
    return { ...disk.load(), ...health, automaticModelPolling: false };
  }
  return disk.exclusive(async (state, save) => {
    if (name === 'coordinator setup') {
      if (state.service) throw fail('coordinator_service', 'Stop and uninstall the existing coordinator before changing setup.');
      const workers = options.workers?.split(',');
      if (!workers?.length || workers.length > 16 || new Set(workers).size !== workers.length || workers.some(a => !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(a))) throw fail('coordinator_config', 'Select 1..16 unique, locally configured workers.');
      const { agent } = await api(`agents/worker?agent=${encodeURIComponent(options.agent)}`);
      if (!agent?.host || !agent.sessionId || agent.worker) throw fail('coordinator_identity', 'Register the coordinator with its own host/session identity first.');
      for (const a of workers) {
        await store(`worker-${workerKey(selected, userId, a)}`).exclusive(local => {
          if (!local.config || local.configure || local.service || local.config.host !== agent.host || local.config.reviewAgent || local.active || local.runId && !local.closed) throw fail('coordinator_route', 'Each worker must be local, closed, separately configured, without an installed service or reviewAgent. Existing review transfers are not adopted.');
        });
      }
      const config = { host: agent.host, sessionId: agent.sessionId, workers, overdueSeconds: 60, stallSeconds: 900, pollSeconds: 10 };
      for (const [flag, field, min, max] of [['overdue-seconds', 'overdueSeconds', 1, 86400], ['stall-seconds', 'stallSeconds', 60, 86400], ['poll-seconds', 'pollSeconds', 1, 60]]) {
        if (options[flag] !== undefined) config[field] = Number(options[flag]);
        if (!Number.isInteger(config[field]) || config[field] < min || config[field] > max) throw fail('coordinator_config', `Invalid --${flag}.`);
      }
      // Setup grants local dispatch consent; it neither starts a service nor resets retry history.
      state.config = config; state.paused = false; state.status = 'ready'; save(state);
      return { configured: true, started: false, config };
    }
    if (name === 'coordinator uninstall') return workerService('worker uninstall', `coord-${identity}`, options, state, save, { ...deps.service, kind: 'coordinator' });
    if (!state.config) throw fail('coordinator_config', 'Run coordinator setup first.');
    if (name === 'coordinator install') return workerService('worker install', `coord-${identity}`, options, state, save, { ...deps.service, kind: 'coordinator' });
    if (name !== 'coordinator run') throw fail('unknown_command', 'Unknown coordinator command.');
    if (state.paused) return { state: 'paused', next: 'Explicit coordinator setup is required to resume.' };
    if (options['service-id'] && (!state.service || state.service.retired || state.service.installationId !== options['service-id'])) return { state: 'stopped', reason: 'service_retired' };
    const config = state.config, abort = new AbortController(), stop = () => abort.abort();
    const generation = randomUUID(), binding = { project: options.project, agent: options.agent, host: config.host, sessionId: config.sessionId, generation };
    const lease = event => api('agents/coordinator', { method: 'POST', timeout: 5000, body: { ...binding, event } });
    let server, renewal, renewError, finish, admitted = false;
    const finished = new Promise(resolve => { finish = resolve; });
    const renewalAbort = new AbortController();
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    state.attempts ||= {}; state.decisions ||= [];
    try {
      if (deps.startupError) throw deps.startupError;
      await lease('acquire'); admitted = true; state.runId = generation; state.closed = false; save(state);
      renewal = (async () => {
        try {
          while (!renewalAbort.signal.aborted) { await sleep(10000, undefined, { signal: renewalAbort.signal }); await lease('renew'); }
        } catch (error) { if (!renewalAbort.signal.aborted) { renewError = error; stop(); } }
      })();
      const nonce = randomUUID();
      server = createServer(async (req, res) => {
        if (req.method !== 'POST' || req.headers.authorization !== `Bearer ${nonce}` || !['/status', '/stop'].includes(req.url)) { res.writeHead(403); res.end(); return; }
        if (req.url === '/stop') { state.paused = true; save(state); stop(); await finished; }
        res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ nonce, stopped: req.url === '/stop' }));
      });
      server.listen(0, '127.0.0.1'); await once(server, 'listening');
      await controls.exclusive((_s, write) => write({ port: server.address().port, nonce }));
      while (!abort.signal.aborted) {
        if (now() < (state.clock || 0)) throw fail('clock_rollback', 'Clock moved backwards; coordinator paused.');
        state.clock = now(); state.status = 'monitoring'; state.heartbeatAt = new Date(now()).toISOString(); state.decisions = []; save(state);
        let cursor, pages = 0;
        do {
          const snapshot = await api(`agents/coordinator?project=${encodeURIComponent(options.project)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
          if (snapshot.project !== options.project || !Array.isArray(snapshot.items) || snapshot.items.length > 50 || !Array.isArray(snapshot.agents) || snapshot.agentsTruncated) throw fail('coordinator_response', 'Incomplete project snapshot; no dispatch.');
          for (const task of snapshot.items) {
            abort.signal.throwIfAborted();
            if (!identifier(task.id) || task.issue?.projectId !== options.project) throw fail('coordinator_response', 'Task project binding is invalid.');
            const decision = { handoffId: task.id, issueKey: task.issue.issueKey, ...classifyTask(task, snapshot.agents, config, now()), owner: options.agent };
            if (decision.action === 'dispatch') {
              const key = task.id, prior = state.attempts[key];
              if (prior?.pending) { decision.reason = 'uncertain_prior_dispatch'; decision.action = 'blocked'; }
              else if (prior?.count >= 3) { decision.reason = 'retry_limit'; decision.action = 'blocked'; }
              else if (prior?.nextAt > now()) { decision.reason = 'backoff'; decision.action = 'observe'; }
              else {
                const local = store(`worker-${workerKey(selected, userId, decision.agent)}`).load();
                if (!local.config || local.config.host !== config.host || local.config.reviewAgent || local.service || local.configure || local.active || local.runId && !local.closed || !safeReasons.has(local.stopReason ?? null)) {
                  decision.reason = local.stopReason || 'worker_closure_or_binding'; decision.action = 'blocked';
                } else {
                  // Persist before dispatch. A crash before a return requires reconciliation, not a second start.
                  if (Object.keys(state.attempts).length >= 1000 && !prior) throw fail('coordinator_journal_full', 'Retained coordinator journal is full; inspect completed history before creating another coordinator.');
                  state.attempts[key] = { count: (prior?.count || 0) + 1, pending: true, worker: decision.agent, at: now() }; save(state);
                  await lease('renew'); abort.signal.throwIfAborted();
                  let result;
                  try {
                    result = await worker('worker run', { agent: decision.agent, workspace: options.workspace }, selected, userId,
                      { ...deps.workerDependencies, api, task: { id: task.id, project: options.project }, signal: abort.signal });
                  } catch (error) {
                    const closed = store(`worker-${workerKey(selected, userId, decision.agent)}`).load();
                    if (!['transport_failed', 'server_error', 'rate_limited'].includes(error.code) || !closed.closed || closed.active) throw error;
                    result = { state: 'retrying', stopReason: error.code };
                  }
                  state.attempts[key].pending = false; state.attempts[key].nextAt = now() + 30000 * 2 ** (state.attempts[key].count - 1);
                  decision.reason = result.stopReason || result.state; decision.action = result.active ? 'blocked' : 'observe'; save(state);
                }
              }
            }
            state.decisions.push(decision); state.decisions = state.decisions.slice(-50); save(state);
          }
          if (snapshot.nextCursor && (!identifier(snapshot.nextCursor) || snapshot.nextCursor === cursor)) throw fail('coordinator_response', 'Invalid snapshot cursor.');
          cursor = snapshot.nextCursor;
        } while (cursor && ++pages < 100 && !abort.signal.aborted);
        if (cursor) throw fail('coordinator_scan_limit', 'Project scan exceeds 5000 tasks; inspect retained status.');
        if (deps.once) break;
        await sleep(config.pollSeconds * 1000, undefined, { signal: abort.signal });
      }
      if (renewError) throw renewError;
    } catch (error) {
      if (renewError || !abort.signal.aborted) { state.status = 'blocked'; state.error = (renewError || error).code || 'coordinator_failed'; state.paused = true; }
    } finally {
      renewalAbort.abort(); await renewal;
      if (admitted) { try { await lease('close'); state.closed = true; } catch { state.closed = false; state.error = 'lease_close_unconfirmed'; } }
      if (state.status !== 'blocked') state.status = state.paused ? 'paused' : 'stopped'; save(state);
      finish();
      if (server) await new Promise(resolve => server.close(resolve));
      await controls.exclusive((_s, write) => write({}));
      process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    }
    return state;
  });
}
