/**
 * A release swaps the app container: Docker asks the process to stop, then kills it ten seconds later.
 *
 * Next answers the signal by closing the HTTP server and waiting for it: `server.close()` drops the connections that
 * sit idle between requests, but waits forever for one that is open without a finished request — a realtime stream,
 * a client that holds a socket without sending on it. One such connection kept the process alive until Docker killed
 * it, so a swap cost ten seconds instead of two and whatever was in flight was cut off by the kill anyway.
 *
 * The watchdog ends the process itself a short while after the signal, with the code the signal would have given, so
 * a stop costs the grace period below and never Docker's ten seconds. Requests take milliseconds and still finish.
 */
const EXIT_CODES = { SIGTERM: 143, SIGINT: 130 } as const;

/** How long a stop waits for the graceful close before the process ends itself. */
export function shutdownGraceMs(): number {
  const configured = Number(process.env.COLLAB_SHUTDOWN_GRACE_MS);
  return Number.isFinite(configured) && configured >= 0 ? configured : 2000;
}

/** Arm the watchdog for this process. Called once, from `register()` in src/instrumentation.ts. */
export function registerShutdownWatchdog(): void {
  const state = globalThis as typeof globalThis & { __collabShutdownWatchdog?: boolean };
  if (state.__collabShutdownWatchdog) return;
  state.__collabShutdownWatchdog = true;

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      const grace = shutdownGraceMs();
      // Unref'd: a process that closes on its own is never held open by the watchdog itself.
      setTimeout(() => {
        console.warn(`[shutdown] ${signal}: connections still open ${grace} ms after the signal; ending the process.`);
        process.exit(EXIT_CODES[signal]);
      }, grace).unref();
    });
  }
}
