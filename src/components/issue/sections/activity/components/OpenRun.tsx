"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";

interface Run { id: string; state: string; startedAt: string; by: string | null; clearable: boolean }
interface Review { requestKey: string; state: string; reviewed?: string; by?: string | null }

const reviewState: Record<string, string> = { open: "open", passed: "passed", failed: "failed", closed: "closed without a verdict" };

/** The security requests filed for the issue, oldest first, each with where it stands and a link to it. */
function SecurityReviews({ reviews }: { reviews: Review[] }) {
  const { workspaceId } = useParams<{ workspaceId?: string }>();
  if (!reviews.length) return null;
  return (
    <div role="status" className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-collab-600 px-2.5 py-1.5 text-xs text-collab-400">
      <span>Security review</span>
      {reviews.map(review => (
        <span key={review.requestKey}>
          <a className="underline" href={`${workspaceId ? `/${workspaceId}` : ""}/issues/${review.requestKey}`}>{review.requestKey}</a>{" "}
          <span className={review.state === "passed" ? "text-green-500" : review.state === "failed" ? "text-red-400" : undefined}>{reviewState[review.state] ?? review.state}</span>
          {review.reviewed && `: ${review.reviewed}${review.by ? `, by ${review.by}` : ""}`}
        </span>
      ))}
    </div>
  );
}

/**
 * Above the timeline: the issue's security reviews, and the run that is open on it: who is working it and since when,
 * and for a run nobody holds any more, the way to clear it.
 */
export function OpenRun({ issueId }: { issueId: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [security, setSecurity] = useState<Review[]>([]);
  const [failed, setFailed] = useState(false);
  // Counts up after a clear, so the run is read again.
  const [reads, setReads] = useState(0);
  useEffect(() => {
    let current = true;
    fetch(`/api/issues/${issueId}/runs`).then(reply => {
      if (!reply.ok) throw new Error("Failed to read run");
      return reply.json();
    }).then(body => { if (current) { setRun(body.run); setSecurity(body.security ?? []); } }).catch(() => {});
    return () => { current = false; };
  }, [issueId, reads]);
  if (!run) return <SecurityReviews reviews={security} />;

  const clear = async () => {
    const reply = await fetch(`/api/issues/${issueId}/runs/${run.id}/clear`, { method: "POST" }).catch(() => null);
    setFailed(!reply?.ok);
    // Cleared: the run is gone whatever the next read says.
    if (reply?.ok) {
      setRun(null);
      setReads(count => count + 1);
    }
  };
  return (
    <>
      <SecurityReviews reviews={security} />
      <div role="status" className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-collab-600 px-2.5 py-1.5 text-xs text-collab-400">
        <span>
          {run.by || "Someone"} started working on this issue {formatDistanceToNow(new Date(run.startedAt), { addSuffix: true })}
          {run.state === "lost" ? " and stopped answering. The issue is not offered again until this run is cleared." : "."}
        </span>
        {run.clearable && <Button variant="outline" size="sm" onClick={clear}>Session has stopped: clear run</Button>}
        {failed && <span role="alert" className="text-red-400">The run was not cleared. Reload the page and try again.</span>}
      </div>
    </>
  );
}
