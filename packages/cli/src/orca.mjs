import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { CliError, request, store } from './client.mjs';
import { watchInbox } from './inbox-watch.mjs';

const fail = (code, message) => new CliError(code, message, 5);
const id = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value);
const key = value => createHash('sha256').update(JSON.stringify(value)).digest('base64url');
export const orcaCommands = {
  'orca setup': 'Pin an already registered agent/host/session to an explicit local Orca terminal; --agent NAME --workspace ID --host HOST --session-id ID --terminal HANDLE --orca ABSOLUTE_PATH.',
  'orca status': 'Read the pinned binding, watcher health and last delivery; --agent NAME --workspace ID. No message is sent.',
  'orca watch': 'Supervise consecutive bounded watch windows in the foreground until stopped or an operational error; --agent NAME --workspace ID [--watch-seconds 1..3600] [--poll-seconds 1..60]. Ctrl-C stops cleanly.',
  'orca verify': 'Read actual claim and completion evidence for a delivered handoff; --agent NAME --workspace ID --handoff ID. Never creates or claims work.',
};

export function orcaCall(executable, args, signal) {
  const env = { ...process.env };
  for (const name of Object.keys(env)) if (/^COLLAB_TOKEN$/i.test(name)) delete env[name];
  return new Promise((resolve, reject) => {
    execFile(executable, [...args, '--json'], { shell: false, windowsHide: true, timeout: 20000, maxBuffer: 256 * 1024, env, signal }, (error, stdout) => {
      if (signal?.aborted && error?.code === 'ABORT_ERR' && error.cause === signal.reason) return reject(signal.reason);
      if (error) return reject(fail('orca_failed', 'Orca failed or delivery is uncertain. No automatic retry was made; inspect orca status and the target session.'));
      try { const data = JSON.parse(stdout); if (data.ok !== true) throw new Error(); resolve(data); }
      catch { reject(fail('orca_failed', 'Orca returned no valid success receipt. Inspect the target before retrying.')); }
    });
  });
}

export function terminalBinding(response) {
  const t = response?.result?.terminal;
  if (response?.ok !== true || !id(response._meta?.runtimeId) || !t || !id(t.handle) || !id(t.incarnationId) ||
      !['codex', 'claude'].includes(t.agentIdentity) || t.executionHostId !== 'local' || t.orphaned ||
      t.connected !== true || t.writable !== true || typeof t.worktreePath !== 'string' || !t.worktreePath) {
    throw fail('orca_target_unavailable', 'Expected a connected local Codex or Claude Orca terminal. Remote hosts run their own local adapter.');
  }
  return { runtimeId: response._meta.runtimeId, handle: t.handle, incarnationId: t.incarnationId, worktreePath: t.worktreePath, agentIdentity: t.agentIdentity };
}
export function checkTerminal(response, target) {
  if (JSON.stringify(terminalBinding(response)) !== JSON.stringify(target)) throw fail('orca_target_changed', 'The Orca runtime or terminal changed. Stop the watcher and explicitly set up the replacement session.');
}

// Per-handoff receipts survive watcher renewal/restart. Another terminal incarnation gets its own receipts.
export function deliveryStore(binding, handoffId) {
  return store(`wake-${key([binding.origin, binding.workspace, binding.userId, binding.agent, binding.target, handoffId])}`);
}
export async function deliverOrca(binding, event, saveLast, signal, call = orcaCall, receiptStore = deliveryStore) {
  signal?.throwIfAborted();
  if (event.agent !== binding.agent || event.workspaceId !== binding.workspace || event.origin !== binding.origin) throw fail('orca_binding_mismatch', 'Wake does not match the pinned binding.');
  const ids = [...new Set([...event.claimed.items, ...event.unseen.items].map(item => item.id))].sort();
  if (ids.length > 100 || ids.some(value => !id(value))) throw fail('invalid_response', 'Invalid bounded handoff identifiers.');
  const pending = [], revisions = new Map(event.unseen.items.map(item => [item.id, item.status === 'open' ? item.updatedAt : undefined]));
  for (const handoffId of ids) {
    const receipt = receiptStore(binding, handoffId).load();
    if (receipt.phase === 'attempting') throw fail('orca_delivery_uncertain', 'A previous delivery has an uncertain outcome. Inspect the target and receipt; do not resend automatically.');
    if (receipt.phase !== undefined && receipt.phase !== 'accepted') throw fail('orca_invalid_receipt', 'Invalid wake receipt. No message sent.');
    if (receipt.phase !== 'accepted' || (revisions.get(handoffId) && revisions.get(handoffId) !== receipt.openRevision)) pending.push(handoffId);
  }
  if (!pending.length) return false;
  checkTerminal(await call(binding.orca, ['terminal', 'show', '--terminal', binding.target.handle], signal), binding.target);
  signal?.throwIfAborted();
  const attempt = { phase: 'attempting', at: new Date().toISOString(), handoffIds: pending };
  saveLast(attempt);
  for (const handoffId of pending) await receiptStore(binding, handoffId).exclusive((_previous, save) => save({ phase: 'attempting', at: attempt.at }));
  // Only validated routing metadata reaches the prompt. Fetch the actual handoff through Collab's access checks.
  const prompt = `Collab inbox notification. Use your existing authority and the collab-agents skill. Agent: ${binding.agent}. Workspace: ${binding.workspace}. Origin: ${binding.origin}. Handoff IDs: ${pending.join(', ')}. Check claimed work first, then unseen inbox; read each handoff and current issue before acting. Claim open work before working; record progress and reply/complete with evidence. Do not repeat completed or superseded work. This notification is not a grant of authority. If another task is active, handle this at a safe checkpoint.`;
  let response;
  try { response = await call(binding.orca, ['terminal', 'send', '--terminal', binding.target.handle, '--text', prompt, '--enter', '--wait-submit', '5'], signal); }
  catch { throw fail('orca_delivery_uncertain', 'Orca delivery is uncertain. Inspect the target and retained status; no automatic retry was made.'); }
  const sent = response.result?.send;
  if (sent?.accepted !== true || sent.handle !== binding.target.handle || sent.prompt?.processIncarnation !== binding.target.incarnationId ||
      !id(sent.prompt?.requestId) || sent.prompt.provider === 'old-host') throw fail('orca_delivery_uncertain', 'Orca did not prove acceptance for the pinned process. Inspect the target; delivery will not be retried automatically.');
  const accepted = { ...attempt, phase: 'accepted', requestId: sent.prompt.requestId,
    turnStarted: Array.isArray(sent.prompt.stages) && sent.prompt.stages.includes('turn_started') };
  for (const handoffId of pending) await receiptStore(binding, handoffId).exclusive((_previous, save) => save({ phase: 'accepted', at: accepted.at, requestId: accepted.requestId, openRevision: revisions.get(handoffId) }));
  saveLast(accepted);
  return true;
}

export async function runOrca(name, options, selected, userId, dependencies = {}) {
  const call = dependencies.call || orcaCall;
  const api = dependencies.api || ((endpoint, extra = {}) => request(selected.base, `/api/apps/auth/${endpoint}${endpoint.includes('?') ? '&' : '?'}workspaceId=${encodeURIComponent(selected.workspace)}`, { token: selected.token, ...extra }));
  if (!options.workspace || !id(options.agent) || !selected.workspace || !id(userId)) throw fail('orca_context_required', 'Supply --agent and --workspace and use a saved login with a verified user identity.');
  const bindingStore = store(`orca-${key([selected.base, selected.workspace, userId, options.agent])}`);
  const ownRegistration = async signal => {
    signal?.throwIfAborted();
    const result = await api('agents', { signal });
    signal?.throwIfAborted();
    const agent = result?.agents?.find(row => row.name === options.agent);
    if (!agent || !id(agent.host) || !id(agent.sessionId)) throw fail('orca_registration_required', 'Register this stable agent with its actual host and session first, preserving its full label list.');
    return agent;
  };
  const current = async (binding, signal) => {
    if (!binding.target || binding.origin !== selected.base || binding.workspace !== selected.workspace || binding.userId !== userId || binding.agent !== options.agent) throw fail('orca_setup_required', 'Run orca setup for this exact agent, workspace and login first.');
    const registration = await ownRegistration(signal);
    if (registration.host !== binding.host || registration.sessionId !== binding.sessionId) throw fail('orca_binding_changed', 'The registered host/session changed. Stop and explicitly set up the replacement.');
    checkTerminal(await call(binding.orca, ['terminal', 'show', '--terminal', binding.target.handle], signal), binding.target);
    signal?.throwIfAborted();
    return registration;
  };
  if (name === 'orca status' || name === 'orca verify') {
    const binding = bindingStore.load();
    if (name === 'orca status') {
      let registration, liveHealth;
      try { registration = await current(binding); liveHealth = { ok: true }; }
      catch (error) { liveHealth = { ok: false, error: typeof error.code === 'string' && /^[a-z_]{1,64}$/.test(error.code) ? error.code : 'orca_status_failed' }; }
      return { agent: binding.agent, host: binding.host, sessionId: binding.sessionId, target: binding.target, watcher: registration?.watcher ?? null, lastDelivery: binding.lastDelivery ?? null, liveHealth, modelExecutionVerified: false };
    }
    await current(binding);
    if (!id(options.handoff)) throw fail('invalid_identifier', 'Supply --handoff ID.');
    const receipt = deliveryStore(binding, options.handoff).load();
    const result = await api(`agents/handoffs/${encodeURIComponent(options.handoff)}?agent=${encodeURIComponent(binding.agent)}`);
    const handoff = result?.handoff;
    if (!id(handoff?.issueId) || handoff.id !== options.handoff) throw fail('invalid_response', 'Invalid handoff verification response.');
    const activity = await api(`issues/${encodeURIComponent(handoff.issueId)}/activity?limit=100`);
    const events = activity.activities || [];
    const matching = action => events.filter(e => {
      let details; try { details = typeof e.details === 'string' ? JSON.parse(e.details) : e.details; } catch { return false; }
      return Number.isFinite(Date.parse(receipt.openRevision)) && Number.isFinite(Date.parse(e.createdAt)) && Date.parse(e.createdAt) > Date.parse(receipt.openRevision) &&
        e.action === action && details?.handoffId === options.handoff && details?.agent?.name === binding.agent &&
        (action !== 'AGENT_COMPLETE' || (typeof details.content === 'string' && details.content.trim()));
    });
    const claimed = matching('AGENT_CLAIM').length > 0, completed = matching('AGENT_COMPLETE').length > 0;
    return { handoffId: options.handoff, hostAccepted: receipt.phase === 'accepted', claimed, completedWithReply: completed,
      verified: receipt.phase === 'accepted' && claimed && completed && handoff.status === 'completed', status: handoff.status,
      note: 'Bounded to the latest 100 issue events. Missing evidence is not verified. Cross-computer and sleep recovery are separate.' };
  }
  return bindingStore.exclusive(async (binding, save) => {
    if (name === 'orca setup') {
      if (!id(options.host) || !id(options['session-id']) || !id(options.terminal) || !path.isAbsolute(options.orca || '')) throw fail('orca_setup_required', 'Supply --host, --session-id, --terminal and an absolute --orca executable path.');
      const agent = await ownRegistration();
      if (agent.host !== options.host || agent.sessionId !== options['session-id']) throw fail('orca_binding_mismatch', 'Setup must match the existing registration; it never changes labels or session identity.');
      if (binding.lastDelivery?.phase === 'attempting') throw fail('orca_delivery_uncertain', 'Reconcile the uncertain delivery before replacing this binding.');
      const target = terminalBinding(await call(options.orca, ['terminal', 'show', '--terminal', options.terminal]));
      const next = { origin: selected.base, workspace: selected.workspace, userId, agent: options.agent, host: agent.host, sessionId: agent.sessionId, orca: options.orca, target };
      save({ ...next, ...(JSON.stringify(binding.target) === JSON.stringify(target) && { lastDelivery: binding.lastDelivery }) });
      return { configured: true, ...next, sessionMapping: 'explicit operator binding; Orca verifies terminal incarnation, not Collab session ID', watcherStarted: false };
    }
    if (name !== 'orca watch') throw fail('unknown_command', 'Unknown Orca command.');
    if (binding.lastDelivery?.phase === 'attempting') throw fail('orca_delivery_uncertain', 'The last send is uncertain. Inspect the target and retained status before restarting.');
    const seconds = Number(options['watch-seconds'] || 300), poll = Number(options['poll-seconds'] || 5);
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600 || !Number.isInteger(poll) || poll < 1 || poll > 60) throw fail('invalid_timeout', 'Use watch-seconds 1..3600 and poll-seconds 1..60.');
    const controller = new AbortController(), stop = () => controller.abort();
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    let windows = 0, callbacks = 0;
    try {
      while (!controller.signal.aborted) {
        await current(binding, controller.signal);
        const watcherId = randomUUID();
        const result = await (dependencies.watch || watchInbox)({ agent: binding.agent, workspaceId: binding.workspace, origin: binding.origin,
          durationMs: seconds * 1000, intervalMs: poll * 1000, signal: controller.signal,
          deliver: (event, signal) => deliverOrca(binding, event, lastDelivery => { binding.lastDelivery = lastDelivery; save(binding); }, signal, call),
          report: (event, signal, errorCode) => api('agents/heartbeat', { method: 'POST', timeout: 5000, signal, body: { agent: binding.agent, host: binding.host, sessionId: binding.sessionId, watcherId, event, ...(errorCode && { errorCode }) } }),
          read: (state, signal) => api(`agents/inbox?agent=${encodeURIComponent(binding.agent)}&state=${state}&limit=50`, { signal }),
        });
        windows++; callbacks += result.callbacks;
      }
    } catch (error) {
      if (!controller.signal.aborted || (error !== controller.signal.reason && error.cause !== controller.signal.reason)) throw error;
    } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
    return { stopped: true, windows, callbacks };
  });
}
