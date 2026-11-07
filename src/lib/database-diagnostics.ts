// Timings cover the whole Prisma operation; they do not isolate connection-pool wait.
let slowOperations = 0;
let poolTimeoutOperations = 0;
let poolTimeoutTransactionStarts = 0;
let maxOperationMs = 0;
let slowTransactionStarts = 0;
let transactionStartFailures = 0;
let maxTransactionStartMs = 0;
let pending: ReturnType<typeof setTimeout> | undefined;

function scheduleSummary() {
  if (pending) return;
  pending = setTimeout(() => {
    const summary = { slowOperations, poolTimeoutOperations, poolTimeoutTransactionStarts, maxOperationMs, slowTransactionStarts,
      transactionStartFailures, maxTransactionStartMs, windowMs: 60000 };
    slowOperations = 0; poolTimeoutOperations = 0; poolTimeoutTransactionStarts = 0; maxOperationMs = 0;
    slowTransactionStarts = 0; transactionStartFailures = 0; maxTransactionStartMs = 0; pending = undefined;
    try { console.warn('[database-diagnostics]', summary); } catch { /* Logging must not affect the process. */ }
  }, 60000);
  pending.unref?.();
}

function isPoolTimeout(error: unknown) {
  try {
    const value = error as { code?: unknown; errorCode?: unknown } | null;
    return value?.code === 'P2024' || value?.errorCode === 'P2024';
  } catch { return false; }
}

function recordOperation(duration: number) {
  if (duration >= 1000) slowOperations++;
  maxOperationMs = Math.max(maxOperationMs, Math.round(duration));
  scheduleSummary();
}

// Prisma fans a single engine batch failure out to multiple query errors.
export function instrumentDatabaseEngine(client: any) {
  const engine = client._engine;
  const marker = Symbol.for('collab.databaseDiagnostics');
  if (!engine || engine[marker]) return;
  engine[marker] = true;
  for (const method of ['request', 'requestBatch'] as const) {
    const original = engine[method];
    engine[method] = async function (this: any, ...args: any[]) {
      try { return await original.apply(this, args); }
      catch (error) {
        if (isPoolTimeout(error)) {
          try { poolTimeoutOperations++; scheduleSummary(); } catch { /* Preserve the original error. */ }
        }
        throw error;
      }
    };
  }
}

function recordTransactionStart(duration: number, failed: boolean, error?: unknown) {
  if (duration >= 1000) slowTransactionStarts++;
  if (failed) transactionStartFailures++;
  if (failed && isPoolTimeout(error)) poolTimeoutTransactionStarts++;
  maxTransactionStartMs = Math.max(maxTransactionStartMs, Math.round(duration));
  scheduleSummary();
}

export const databaseDiagnosticsExtension = {
  name: 'database-diagnostics',
  query: {
    async $allOperations({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
      const start = performance.now();
      try {
        return await query(args);
      } finally {
        const duration = performance.now() - start;
        if (duration >= 1000) {
          try { recordOperation(duration); } catch { /* Diagnostics must not affect a query. */ }
        }
      }
    },
  },
};

// Timing ends when Prisma invokes the callback, and includes more than pool wait.
export function withTransactionDiagnostics<T extends { $transaction: (...args: any[]) => Promise<any> }>(client: T): T {
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property !== '$transaction') return Reflect.get(target, property, receiver);
      return (...args: any[]) => {
        if (typeof args[0] !== 'function') return target.$transaction(...args);
        const original = args[0];
        const start = performance.now();
        let entered = false;
        args[0] = (...callbackArgs: any[]) => {
          entered = true;
          const duration = performance.now() - start;
          if (duration >= 1000) {
            try { recordTransactionStart(duration, false); } catch { /* Diagnostics must not affect a transaction. */ }
          }
          return original(...callbackArgs);
        };
        return target.$transaction(...args).catch((error: unknown) => {
          if (!entered) {
            try { recordTransactionStart(performance.now() - start, true, error); } catch { /* Preserve the original error. */ }
          }
          throw error;
        });
      };
    },
  });
}
