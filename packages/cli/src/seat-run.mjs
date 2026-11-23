import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { CliError } from './client.mjs';
import { serverAway } from './inbox-watch.mjs';

// The interim runner: it waits for the seat's next issue in plain code, then starts one fresh program per issue.
// Only the program named on the command line is run, with the arguments given and no shell. Remote content is never code.
export async function seatRun({ api, program, args, once, runner, signal, pollMs = 5000, renewMs = 15000, killMs = 10000,
  log = event => process.stderr.write(JSON.stringify(event) + '\n') }) {
  // Issues this runner leaves alone while the inbox keeps listing them, how often each ended unfinished in a row, and
  // the ones whose project waits for a default repository, which are tried again rather than left alone.
  const skip = new Set(), unfinished = new Map(), waiting = new Set(), runs = [];
  const sleep = ms => delay(ms, undefined, { signal }).catch(() => {});
  // A read, a renew or a close can be repeated, so each is tried again while the server is away, as it is on every deploy.
  const patient = async call => {
    for (;;) {
      try { return await call(); }
      catch (error) { if (!serverAway(error)) throw error; await delay(pollMs); }
    }
  };
  // The run's instructions, platform, organisation and seat, as one file the program is pointed at. Without a run context
  // that carries them (an older server, or a refused read) the program starts as before, and that is said.
  async function instructionsFile(issueKey) {
    let layers;
    try { layers = (await patient(() => api('GET', `issues/${encodeURIComponent(issueKey)}/run-context`)))?.instructions; } catch {}
    if (!Array.isArray(layers) || layers.some(layer => typeof layer?.text !== 'string')) { log({ event: 'no_instructions', issueKey }); return null; }
    const texts = layers.map(layer => layer.text.trim()).filter(Boolean);
    let dir = null;
    try {
      dir = await mkdtemp(join(tmpdir(), 'collab-run-'));
      await writeFile(join(dir, 'instructions.md'), texts.length ? `${texts.join('\n\n')}\n` : '', { mode: 0o600 });
      return dir;
    } catch {
      if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
      log({ event: 'no_instructions', issueKey });
      return null;
    }
  }
  async function work(item, run, generation) {
    const issueKey = item.issueKey ?? item.issueId;
    log({ event: 'run_started', issueKey, runId: run.id });
    // The program's output goes to stderr: stdout is this command's one JSON result.
    let failed = false, exitCode = null, dir = null;
    if (!signal?.aborted) {
      let child;
      dir = await instructionsFile(issueKey);
      // A file named by this runner's own environment is not this run's: the variable is set only for a file written here.
      const { COLLAB_INSTRUCTIONS_FILE: _inherited, ...env } = process.env;
      try {
        child = spawn(program, args, { shell: false, windowsHide: true, stdio: ['inherit', 2, 2],
          env: { ...env, COLLAB_RUN_ID: run.id, COLLAB_RUN_GENERATION: generation, COLLAB_ISSUE_KEY: issueKey,
            ...(dir && { COLLAB_INSTRUCTIONS_FILE: join(dir, 'instructions.md') }) } });
      } catch { failed = true; }
      if (child) {
        // A program that does not stop when asked is killed: a fenced session must not go on working.
        let killer, active = true;
        const stop = () => { if (active) { child.kill(); killer ??= setTimeout(() => child.kill('SIGKILL'), killMs); } };
        signal?.addEventListener('abort', stop, { once: true });
        // A renew the server refuses means the run is fenced: the issue went to someone else or the run was marked lost.
        // The program has to stop before anyone else can start, so it is stopped here and the run closed below.
        const timer = setInterval(() => api('PATCH', `runs/${run.id}`, { event: 'renew', generation }).catch(error => { if (!serverAway(error)) stop(); }), renewMs);
        if (signal?.aborted) stop();
        exitCode = await new Promise(resolve => {
          child.on('error', () => { failed = true; active = false; resolve(null); });
          child.on('close', code => { active = false; resolve(code); });
        });
        clearInterval(timer); clearTimeout(killer); signal?.removeEventListener('abort', stop);
      }
      if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    let state;
    try {
      state = (await patient(() => api('GET', `runs/${run.id}`))).run?.state;
      if (state !== 'finished') state = (await patient(() => api('PATCH', `runs/${run.id}`, { event: 'close', generation }))).run?.state;
    } catch (error) {
      // 409: a person cleared the run first, or it is a release seat's and waits for a person. It is not this runner's to end.
      if (error.details?.status !== 409) throw error;
      state = error.code;
    }
    runs.push({ issueKey, runId: run.id, state, exitCode });
    log({ event: 'run_ended', issueKey, runId: run.id, state, exitCode });
    if (failed) throw new CliError('program_failed', `The program after -- could not be started. ${state === 'needs_person' ? 'A person must clear the unfinished run on the issue page.' : state === 'stopped' ? 'Its run was closed.' : state === 'finished' ? 'Its run was already finished.' : 'Check the issue page for the run status.'} Check the path and try again.`, 2);
    if (state === 'finished') return unfinished.delete(item.issueId);
    const count = (unfinished.get(item.issueId) ?? 0) + 1;
    unfinished.set(item.issueId, count);
    // A stopped run is offered again first, to resume. Without this, a session that never finishes would be started on the same issue without end.
    if (count >= 3) { skip.add(item.issueId); log({ event: 'left_alone', issueKey, message: 'Three runs in a row ended without a finish. This runner leaves the issue alone until it is restarted or the issue leaves the inbox. A person should look at it.' }); }
  }
  while (!signal?.aborted) {
    let items;
    try { items = (await api('GET', 'seats/me/inbox'))?.items; }
    catch (error) { if (!serverAway(error)) throw error; await sleep(pollMs); continue; }
    if (!Array.isArray(items) || items.some(item => typeof item?.issueId !== 'string')) throw new CliError('invalid_response', 'Expected inbox items.', 5);
    for (const id of new Set([...skip, ...unfinished.keys(), ...waiting])) if (!items.some(item => item.issueId === id)) { skip.delete(id); unfinished.delete(id); waiting.delete(id); }
    let ran = false;
    for (const item of items) {
      if (signal?.aborted) break;
      if (skip.has(item.issueId)) continue;
      const generation = randomUUID();
      let run;
      try { run = (await api('POST', 'runs', { issue: item.issueId, generation, runner })).run; }
      catch (error) {
        // Refused over the repository: an administrator chooses a default in Project settings and nothing else has to
        // happen, so this one is waited for and tried again at the next read of the inbox, and said once while it waits.
        if (error.code === 'repository_required' && error.details?.status === 409) {
          if (!waiting.has(item.issueId)) {
            waiting.add(item.issueId);
            log({ event: 'waiting', issueKey: item.issueKey, reason: error.code,
              message: 'The project has several repositories and no default for agents. This runner tries the issue again once an administrator chooses one in Project settings.' });
          }
          continue;
        }
        // Refused: someone holds it, or it waits for a person. Not tried again while it stays listed; the next item is.
        if (error.details?.status === 409) { skip.add(item.issueId); log({ event: 'skipped', issueKey: item.issueKey, reason: error.code }); continue; }
        // No answer, a server error or a 429: not tried again at once. The inbox is read again after the wait. If the run
        // exists after all, the inbox no longer lists the issue, its lease lapses and a person clears it.
        if (serverAway(error)) { log({ event: 'checkout_deferred', issueKey: item.issueKey, reason: error.code }); break; }
        throw error;
      }
      if (typeof run?.id !== 'string') throw new CliError('invalid_response', 'Expected a run.', 5);
      // It waits no more: a refusal after this one is a new wait and is said again.
      waiting.delete(item.issueId);
      await work(item, run, generation);
      ran = true;
      break; // One issue at a time: the inbox is read again for the next.
    }
    if (ran && once) break;
    if (!ran) await sleep(pollMs);
  }
  return { runs, stopped: Boolean(signal?.aborted) };
}
