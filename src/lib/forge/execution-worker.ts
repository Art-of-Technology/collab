import 'server-only';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { getUserWorkspaceRole, checkUserPermission, Permission } from '@/lib/permissions';
import { readForgeBindings } from './reader';
import { readForgeIssue } from './issue-store';
import { readProjectMemory } from './memory-store';
import { splitIssueBody } from './issue-content';
import { claimExecution, executionInputSchema, transitionExecution } from './execution-receipts';
import { deploymentIdentity, openExecution, parseRunStream, qualifyDeployment, requestExecutionCancellation } from './stech';

const liveStates = ['LAUNCHING', 'RUNNING', 'CANCEL_REQUESTED'];

export async function runReadyAttempt(id: string, workerId: string, request: typeof fetch = fetch) {
  let claimed;
  try {
    claimed = await claimExecution(id, workerId);
  } catch { return false; }
  if (claimed.count !== 1) return false;
  const fence = { id, workerId, state: { in: liveStates } };
  let launchIssued = false, runId: string | null = null, terminal = false;
  const controller = new AbortController();
  const heartbeat = setInterval(() => {
    void prisma.forgeExecutionAttempt.updateMany({ where: fence, data: { heartbeatAt: new Date() } }).catch(() => controller.abort());
  }, 10000);
  heartbeat.unref();
  try {
    const attempt = await prisma.forgeExecutionAttempt.findUniqueOrThrow({ where: { id } });
    const role = await getUserWorkspaceRole(attempt.requestedBy, attempt.workspaceId);
    if (!['OWNER', 'ADMIN'].includes(role ?? '') || !(await checkUserPermission(attempt.requestedBy, attempt.workspaceId, Permission.VIEW_NOTES)).hasPermission ||
      !(await checkUserPermission(attempt.requestedBy, attempt.workspaceId, Permission.VIEW_TASKS)).hasPermission) throw new Error('Execution authority changed');
    if (!await prisma.project.findFirst({ where: { id: attempt.projectId, workspaceId: attempt.workspaceId }, select: { id: true } })) throw new Error('Project changed');
    const binding = (await readForgeBindings()).find(item => item.projectId === attempt.projectId && item.workspaceId === attempt.workspaceId && item.repositoryId === attempt.repositoryId);
    const deployment = binding?.execution?.deployments.find(item => item.key === attempt.deploymentKey && item.revision === attempt.deploymentRevision && item.configuredModel === attempt.configuredModel);
    if (!binding?.memory || !deployment || deploymentIdentity(deployment) !== attempt.deploymentIdentity) throw new Error('Execution connection changed');
    const input = executionInputSchema.parse(attempt.input);
    if (input.journalOrigin !== binding.origin) throw new Error('Execution source changed');
    const [source, memory] = await Promise.all([readForgeIssue(binding, attempt.issueNumber, request), readProjectMemory(binding, request)]);
    const marker = splitIssueBody(source.issue.body ?? '').metadata.execution as { attemptId?: unknown; status?: unknown } | undefined;
    if (source.issue.state !== 'open' || source.fingerprint !== attempt.readyFingerprint || source.partialComments || source.discussionFingerprint !== input.discussionFingerprint || memory.sha !== attempt.memorySha ||
      marker?.attemptId !== id || marker.status !== 'ready') throw new Error('Ready source or approved memory changed');
    await qualifyDeployment(deployment, request);
    const launch = await transitionExecution({ id, workerId, state: 'LAUNCHING' },
      { receipt: 'Launch intent recorded. Missing provider acknowledgment must not be retried.' });
    if (!launch.count) {
      await transitionExecution({ id, workerId, state: 'CANCEL_REQUESTED' },
        { state: 'CANCELLED', safeToRetry: true, finishedAt: new Date(), receipt: 'Cancelled before provider launch.' });
      return true;
    }
    launchIssued = true;
    const response = await openExecution(deployment, input.prompt, request, AbortSignal.any([controller.signal, AbortSignal.timeout(30 * 60 * 1000)]));
    if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
      await response.body?.cancel();
      throw new Error('Launch response unknown');
    }
    for await (const frame of parseRunStream(response.body)) {
      if (frame.type === 'started') {
        if (runId && runId !== frame.runId) throw new Error('Provider run identity changed');
        runId = frame.runId;
        const saved = await transitionExecution({ ...fence, OR: [{ providerRunId: null }, { providerRunId: runId }] },
          { providerRunId: runId, heartbeatAt: new Date(), receipt: 'Provider acknowledged the run; completion is pending.' });
        if (!saved.count) throw new Error('Attempt no longer current');
        await transitionExecution({ id, workerId, state: 'LAUNCHING' }, { state: 'RUNNING' });
        const current = await prisma.forgeExecutionAttempt.findUniqueOrThrow({ where: { id } });
        if (current.state === 'CANCEL_REQUESTED') {
          try {
            const acknowledgedAt = await requestExecutionCancellation(deployment, runId, request);
            await prisma.forgeExecutionAttempt.updateMany({ where: { id, workerId, state: 'CANCEL_REQUESTED' }, data: { cancelAcknowledgedAt: acknowledgedAt } });
          } catch { /* The durable cancellation request remains pending. */ }
        }
      } else if (frame.type === 'done') {
        if (!runId || frame.runId !== runId) throw new Error('Terminal run does not match acknowledgment');
        const completed = ['end_turn', 'stop_sequence'].includes(frame.stopReason);
        if (!completed && frame.stopReason !== 'cancelled') throw new Error('Provider terminal outcome is unqualified');
        const state = frame.stopReason === 'cancelled' ? 'CANCELLED' : (frame.finalText.trim() ? 'REVIEW_REQUIRED' : 'RESULT_MISSING');
        const finished = await transitionExecution({ ...fence, providerRunId: runId }, {
          state, safeToRetry: state !== 'REVIEW_REQUIRED', stopReason: frame.stopReason, finishedAt: new Date(), result: frame.finalText,
          receipt: state === 'REVIEW_REQUIRED' ? 'Provider finished. Review the result and any draft PR; task acceptance, merge, deployment and issue closure are separate.' : 'Provider terminal result recorded; an explicit reviewed retry is required.',
        });
        if (finished.count !== 1) throw new Error('Terminal receipt was not persisted');
        terminal = true; break;
      } else {
        throw new Error('Provider error is not independent terminal evidence');
      }
    }
    if (!terminal) throw new Error('Provider terminal result missing');
    return true;
  } catch {
    await transitionExecution(fence, {
      state: launchIssued ? 'UNKNOWN' : 'FAILED', safeToRetry: !launchIssued, ...(launchIssued ? {} : { finishedAt: new Date() }),
      receipt: launchIssued ? 'Provider outcome is unknown. Reconcile with the provider owner; automatic and manual relaunch are blocked.' : 'Prelaunch verification failed. No provider launch occurred; review the source before retrying.',
    }).catch(() => {});
    return true;
  } finally { clearInterval(heartbeat); }
}

export async function recoverStaleAttempts(now = new Date()) {
  await prisma.forgeExecutionAttempt.updateMany({ where: { state: { in: ['LAUNCHING', 'RUNNING', 'CANCEL_REQUESTED'] }, heartbeatAt: { lt: new Date(+now - 60000) } },
    data: { state: 'UNKNOWN', safeToRetry: false, receipt: 'Worker heartbeat was lost. Reconcile provider state before any replacement; expiry never authorizes relaunch.' } });
  await prisma.forgeExecutionAttempt.updateMany({ where: { state: 'PREPARING', createdAt: { lt: new Date(+now - 300000) } },
    data: { state: 'UNKNOWN', safeToRetry: false, receipt: 'Preparation history may predate an external launch. Reconcile the independent journal; expiry never authorizes retry.' } });
}

export function startReadyWorker() {
  if (process.env.COLLAB_READY_WORKER !== 'enabled') return;
  const state = globalThis as typeof globalThis & { collabReadyTimer?: ReturnType<typeof setInterval> };
  if (state.collabReadyTimer) return;
  const workerId = randomUUID();
  let busy = false;
  // ponytail: one consumer per process; local and independent journal claims fence competing processes/copies.
  state.collabReadyTimer = setInterval(() => {
    if (busy) return;
    busy = true;
    void (async () => {
      await recoverStaleAttempts();
      const attempt = await prisma.forgeExecutionAttempt.findFirst({ where: { state: 'READY' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
      if (attempt) await runReadyAttempt(attempt.id, workerId);
    })().catch(() => { /* Missing migration/configuration leaves execution disabled; no launch fallback. */ }).finally(() => { busy = false; });
  }, 5000);
  state.collabReadyTimer.unref();
}
