"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";

interface Run { id: string; state: string; startedAt: string; by: string | null; clearable: boolean }

/** The run that is open on the issue: who is working it and since when, and for a run nobody holds any more, the way to clear it. */
export function OpenRun({ issueId }: { issueId: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [failed, setFailed] = useState(false);
  // Counts up after a clear, so the run is read again.
  const [reads, setReads] = useState(0);
  useEffect(() => {
    let current = true;
    fetch(`/api/issues/${issueId}/runs`).then(reply => {
      if (!reply.ok) throw new Error("Failed to read run");
      return reply.json();
    }).then(body => { if (current) setRun(body.run); }).catch(() => {});
    return () => { current = false; };
  }, [issueId, reads]);
  if (!run) return null;

  const clear = async () => {
    const reply = await fetch(`/api/issues/${issueId}/runs/${run.id}/clear`, { method: "POST" }).catch(() => null);
    setFailed(!reply?.ok);
    // Cleared: the run is gone whatever the next read says.
    if (reply?.ok) setRun(null);
    setReads(count => count + 1);
  };
  return (
    <div role="status" className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-collab-600 px-2.5 py-1.5 text-xs text-collab-400">
      <span>
        {run.by || "Someone"} started working on this issue {formatDistanceToNow(new Date(run.startedAt), { addSuffix: true })}
        {run.state === "lost" ? " and stopped answering. The issue is not offered again until this run is cleared." : "."}
      </span>
      {run.clearable && <Button variant="outline" size="sm" onClick={clear}>Session has stopped: clear run</Button>}
      {failed && <span role="alert" className="text-red-400">The run was not cleared. Reload the page and try again.</span>}
    </div>
  );
}
