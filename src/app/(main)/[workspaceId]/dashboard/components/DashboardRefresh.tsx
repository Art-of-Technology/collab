'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import RelativeTime from './RelativeTime';

export default function DashboardRefresh({ updatedAt, now }: { updatedAt: string; now: string }) {
  const router = useRouter();
  const lastRefresh = useRef<number | null>(null);
  const refresh = useCallback(() => {
    const requestedAt = Date.now();
    if (lastRefresh.current !== null && requestedAt - lastRefresh.current < 30_000) return;
    lastRefresh.current = requestedAt;
    router.refresh();
  }, [router]);

  useEffect(() => {
    function refreshOnReturn() {
      if (document.visibilityState === 'visible') refresh();
    }

    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => document.removeEventListener('visibilitychange', refreshOnReturn);
  }, [refresh]);

  return <p className="text-xs text-collab-400">
    Updated <RelativeTime value={updatedAt} now={now} />{' · '}
    <button type="button" className="rounded-sm text-blue-300 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-400" onClick={refresh}>Refresh</button>
  </p>;
}
