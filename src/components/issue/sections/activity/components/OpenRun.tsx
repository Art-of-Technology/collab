"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";

interface Question { id: string; text: string }
interface Run { id: string; state: string; startedAt: string; by: string | null; clearable: boolean; question?: Question }
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

function RunQuestion({ issueId, runId, question, onAnswered }: {
  issueId: string; runId: string; question: Question; onAnswered: () => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  const send = async (decision: "approved" | "refused") => {
    setSending(true);
    setFailed(false);
    const reply = await fetch(`/api/issues/${issueId}/runs/${runId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: question.id, decision, ...(text.trim() && { text }) }),
    }).catch(() => null);
    setSending(false);
    if (reply?.ok) onAnswered();
    else setFailed(true);
  };

  return (
    <section aria-label="Question from the seat" className="mb-2 min-w-0 rounded-md border border-collab-600 p-3 text-sm">
      <p className="font-medium">Question from the seat</p>
      <ol dir="ltr" className="my-2 list-decimal space-y-0.5 rounded bg-collab-950 py-2 pl-10 pr-2 font-mono text-xs">
        {question.text.split(/\r\n|[\n\r\u2028\u2029]/).map((line, index) => (
          <li key={index} className="min-h-4 pl-1 whitespace-break-spaces [overflow-wrap:anywhere] [unicode-bidi:isolate]">{line}</li>
        ))}
      </ol>
      <label className="block text-xs">
        Reply (optional)
        <textarea rows={2} maxLength={4000} value={text} onChange={event => setText(event.target.value)}
          className="mt-1 block w-full rounded-md border border-collab-600 bg-transparent p-2" />
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={sending} onClick={() => send("approved")}>Approve</Button>
        <Button type="button" variant="outline" size="sm" disabled={sending} onClick={() => send("refused")}>Refuse</Button>
      </div>
      {failed && <p role="alert" className="mt-2 text-xs text-red-400">The answer could not be saved. Reload the issue to check whether the question is still open.</p>}
    </section>
  );
}

/**
 * Above the timeline: the issue's security reviews, and the run that is open on it: who is working it and since when,
 * and for a run nobody holds any more, the way to clear it.
 */
export function OpenRun({ issueId, onAnswered }: { issueId: string; onAnswered?: () => void }) {
  const [run, setRun] = useState<Run | null>(null);
  const [security, setSecurity] = useState<Review[]>([]);
  const [failed, setFailed] = useState(false);
  // Read the run again after a clear or an answer.
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
          {run.state === "waiting" && " Waiting for the seat owner to answer."}
        </span>
        {run.clearable && <Button variant="outline" size="sm" onClick={clear}>Session has stopped: clear run</Button>}
        {failed && <span role="alert" className="text-red-400">The run was not cleared. Reload the page and try again.</span>}
      </div>
      {run.question && <RunQuestion key={run.question.id} issueId={issueId} runId={run.id} question={run.question} onAnswered={() => {
        setRun(current => current?.id === run.id && current.question?.id === run.question?.id
          ? { ...current, state: "running", question: undefined } : current);
        setReads(count => count + 1);
        onAnswered?.();
      }} />}
    </>
  );
}
