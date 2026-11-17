import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // First, so that a stop is bounded however early it comes: a release waits for it.
    const { registerShutdownWatchdog } = await import('./lib/shutdown-watchdog');
    registerShutdownWatchdog();
    await import('../sentry.server.config');
    await import('./lib/server-init');
    if (process.env.COLLAB_READY_WORKER === 'enabled') {
      const { startReadyWorker } = await import('./lib/forge/execution-worker');
      startReadyWorker();
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
