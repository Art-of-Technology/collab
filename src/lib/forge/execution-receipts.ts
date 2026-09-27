import 'server-only';
import { Prisma, type ForgeExecutionAttempt } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { readExecutionJournal, withExecutionJournal } from './execution-journal.mjs';

const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
export const executionInputSchema = z.object({
  prompt: z.string().min(1).max(100000), discussionFingerprint: fingerprint,
  relevantIds: z.array(z.string()).max(100), journalAuthority: z.string().uuid(),
  journalOrigin: z.string().url().refine(value => {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value;
  }),
}).strict();
const receiptSchema = z.object({
  id: z.string().uuid(), projectId: z.string().min(1), workspaceId: z.string().min(1),
  repositoryId: z.number().int().positive(), issueNumber: z.number().int().positive(), generation: z.number().int().positive(),
  requestedBy: z.string().min(1), retryOf: z.string().uuid().nullable(),
  state: z.enum(['PREPARING', 'READY', 'LAUNCHING', 'RUNNING', 'UNKNOWN', 'CANCEL_REQUESTED', 'CANCELLED', 'FAILED', 'REVIEW_REQUIRED', 'RESULT_MISSING']),
  safeToRetry: z.boolean(), sourceFingerprint: fingerprint, readyFingerprint: fingerprint.nullable(),
  memorySha: z.string().regex(/^[a-f0-9]{40}$/), deploymentKey: z.string().min(1), configuredModel: z.string().min(1),
  deploymentRevision: fingerprint, deploymentIdentity: fingerprint, input: executionInputSchema,
  providerRunId: z.string().min(1).max(100).nullable(),
}).strict();
type Receipt = z.infer<typeof receiptSchema>;
type Target = Parameters<typeof withExecutionJournal>[0];
const receiptFor = (row: unknown) => receiptSchema.strip().parse(row);
function scopedReceipt(value: unknown, target: Target, authorityId: string) {
  const receipt = receiptSchema.parse(value);
  if (receipt.projectId !== target.projectId || receipt.workspaceId !== target.workspaceId || receipt.repositoryId !== target.repositoryId ||
    receipt.issueNumber !== target.issueNumber || receipt.input.journalOrigin !== target.origin || receipt.input.journalAuthority !== authorityId)
    throw new Error('Execution receipt identity changed');
  return receipt;
}
const same = (row: ForgeExecutionAttempt, receipt: Receipt, authorityId: string) =>
  receipt.input.journalAuthority === authorityId && JSON.stringify(receiptFor(row)) === JSON.stringify(receipt);
const unknownData = { state: 'UNKNOWN', safeToRetry: false,
  receipt: 'Independent execution evidence is missing, newer or ambiguous. Reconcile outside the restored database; no launch or retry is authorized.' };

export async function fenceExecutionUnknown(row: ForgeExecutionAttempt) {
  await prisma.forgeExecutionAttempt.updateMany({ where: { id: row.id, projectId: row.projectId,
    workspaceId: row.workspaceId, repositoryId: row.repositoryId, state: row.state }, data: unknownData });
}

export async function claimExecution(id: string, workerId: string): Promise<{ count: number }> {
  const initial = await prisma.forgeExecutionAttempt.findFirst({ where: { id, state: 'READY' } });
  if (!initial) return { count: 0 };
  let claimed = false;
  try {
    const input = executionInputSchema.parse(initial.input);
    const target = { origin: input.journalOrigin, projectId: initial.projectId, workspaceId: initial.workspaceId,
      repositoryId: initial.repositoryId, issueNumber: initial.issueNumber };
    const snapshot = await readExecutionJournal(target);
    if (!same(initial, scopedReceipt(snapshot.receipt, target, snapshot.authorityId), snapshot.authorityId))
      throw new Error('Independent execution history changed');
    const data = { state: 'LAUNCHING', workerId, heartbeatAt: new Date(), receipt: 'Claimed; independent launch authorization pending.' };
    // The local claim selects one worker in this DB; the separate exclusive claim below also fences restored copies.
    const local = await prisma.forgeExecutionAttempt.updateMany({ where: { id, state: 'READY' }, data });
    if (local.count !== 1) return { count: 0 };
    claimed = true;
    return await withExecutionJournal(target, async journal => {
      if (!same(initial, scopedReceipt(journal.receipt, target, journal.authorityId), journal.authorityId))
        throw new Error('Independent launch claim already exists');
      const current = await prisma.forgeExecutionAttempt.findFirst({ where: { id, workerId, state: 'LAUNCHING' } });
      if (!current || JSON.stringify(receiptFor(current)) !== JSON.stringify(receiptFor({ ...initial, ...data })))
        throw new Error('Local launch claim changed');
      await journal.write(receiptFor(current));
      return { count: 1 };
    });
  } catch {
    await fenceExecutionUnknown({ ...initial, state: claimed ? 'LAUNCHING' : 'READY' }).catch(() => {});
    return { count: 0 };
  }
}

async function retainExternalFence(receipt: Receipt) {
  await prisma.forgeExecutionAttempt.upsert({
    where: { id: receipt.id, projectId: receipt.projectId, workspaceId: receipt.workspaceId, repositoryId: receipt.repositoryId },
    create: { ...receipt, ...unknownData }, update: unknownData,
  });
}

export async function reserveExecution(target: Target, retryOf: string | null,
  create: (generation: number, authorityId: string) => Prisma.ForgeExecutionAttemptUncheckedCreateInput) {
  let observed: ForgeExecutionAttempt | null = null;
  try {
    return await withExecutionJournal(target, async journal => {
      observed = await prisma.forgeExecutionAttempt.findFirst({ where: { projectId: target.projectId, issueNumber: target.issueNumber }, orderBy: { generation: 'desc' } });
      const external = journal.receipt === null ? null : scopedReceipt(journal.receipt, target, journal.authorityId);
      if (external ? !observed || !same(observed, external, journal.authorityId) : observed !== null) {
        if (observed) await fenceExecutionUnknown(observed);
        else if (external) await retainExternalFence(external);
        return null;
      }
      if (observed ? observed.id !== retryOf || !observed.safeToRetry || !['FAILED', 'CANCELLED', 'RESULT_MISSING'].includes(observed.state) : retryOf !== null) return null;
      const data = create((observed?.generation ?? 0) + 1, journal.authorityId);
      const receipt = receiptFor(data);
      if (receipt.projectId !== target.projectId || receipt.workspaceId !== target.workspaceId || receipt.repositoryId !== target.repositoryId ||
        receipt.issueNumber !== target.issueNumber || receipt.input.journalOrigin !== target.origin || receipt.input.journalAuthority !== journal.authorityId ||
        receipt.state !== 'PREPARING' || receipt.safeToRetry) throw new Error('Invalid execution reservation');
      await journal.write(receipt);
      try {
        return await prisma.$transaction(async tx => {
          const current = await tx.forgeExecutionAttempt.findFirst({ where: { projectId: target.projectId, issueNumber: target.issueNumber }, orderBy: { generation: 'desc' } });
          if ((current?.id ?? null) !== (observed?.id ?? null) || (current && (!external || !same(current, external, journal.authorityId)))) throw new Error('Execution history changed');
          return tx.forgeExecutionAttempt.create({ data });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        await retainExternalFence(receipt).catch(() => {});
        throw error;
      }
    });
  } catch (error) {
    const latest = await prisma.forgeExecutionAttempt.findFirst({ where: { projectId: target.projectId, issueNumber: target.issueNumber }, orderBy: { generation: 'desc' } }).catch(() => null);
    if (latest) await fenceExecutionUnknown(latest).catch(() => {});
    throw error;
  }
}

// Every state transition reconciles the independent receipt before changing the SQL snapshot.
export async function transitionExecution(where: Prisma.ForgeExecutionAttemptWhereInput,
  data: Prisma.ForgeExecutionAttemptUpdateManyMutationInput): Promise<{ count: number }> {
  const initial = await prisma.forgeExecutionAttempt.findFirst({ where });
  if (!initial) return { count: 0 };
  try {
    const input = executionInputSchema.parse(initial.input);
    const target = { origin: input.journalOrigin, projectId: initial.projectId,
      workspaceId: initial.workspaceId, repositoryId: initial.repositoryId, issueNumber: initial.issueNumber };
    return await withExecutionJournal(target, async journal => {
      const current = await prisma.forgeExecutionAttempt.findFirst({ where });
      if (!current) return { count: 0 };
      const external = scopedReceipt(journal.receipt, target, journal.authorityId);
      if (!same(current, external, journal.authorityId)) {
        await fenceExecutionUnknown(current);
        throw new Error('Independent execution receipt requires reconciliation');
      }
      const next = receiptFor({ ...current, ...data });
      scopedReceipt(next, target, journal.authorityId);
      if (JSON.stringify({ ...external, state: next.state, safeToRetry: next.safeToRetry,
        readyFingerprint: next.readyFingerprint, providerRunId: next.providerRunId }) !== JSON.stringify(next))
        throw new Error('Execution transition changed reviewed identity or input');
      await journal.write(next);
      const result = await prisma.forgeExecutionAttempt.updateMany({ where: { AND: [where, { id: current.id, state: current.state }] }, data });
      if (result.count !== 1) await fenceExecutionUnknown(current);
      return result;
    });
  } catch (error) {
    await fenceExecutionUnknown(initial).catch(() => {});
    throw error;
  }
}
