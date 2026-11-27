import type { CommentAck } from "@/lib/issue-comment-acks";

export type AckLine = { tone: "acked" | "waiting" | "none"; text: string; more: string[]; details: string[] };

/** A span of seconds as a short phrase: "45 s", "3 min", "2 h", "4 d". Never less than 1. */
export function sinceText(seconds: number): string {
  const whole = Math.max(1, Math.round(seconds));
  if (whole < 60) return `${whole} s`;
  const minutes = Math.round(whole / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.max(1, Math.round(hours / 24))} d`;
}

/** What the line under a person's comment says about the ack the server reported for it. */
export function ackLine(ack: CommentAck, createdAt: string, updatedAt?: string): AckLine {
  const created = new Date(createdAt).getTime();
  const after = (at: string) => sinceText((new Date(at).getTime() - created) / 1000);

  if (ack.state === "acked") {
    const first = ack.seats[0] ? new Date(ack.seats[0].at).getTime() : Infinity;
    const edited = updatedAt !== undefined && new Date(updatedAt).getTime() - first > 2000;
    return {
      tone: "acked",
      text: `Acked by ${ack.seats.map(seat => seat.name).join(", ")} · ${ack.seats[0] ? after(ack.seats[0].at) : sinceText(0)} after${edited ? " · edited since" : ""}`,
      more: [],
      details: ack.seats.map(seat => `${seat.name} · ${after(seat.at)} after your comment`),
    };
  }

  if (ack.state === "waiting") {
    const why = ack.reason === "in_run"
      ? " · it is in a run now and gets this when it next asks for new comments"
      : ack.reason === "runner_silent" ? " · its runner has not asked for 2 minutes or more" : "";
    return {
      tone: "waiting",
      text: `Waiting for ${ack.waitingFor}${why}`,
      more: (ack.missed ?? []).map(name => `${name} does not hold this issue; a mention does not reach it`),
      details: [],
    };
  }

  const text = ack.reason === "issue_done"
    ? `No agent will pick this up · the issue is done. Reopen it to send this to ${ack.waitingFor}`
    : ack.reason === "not_given"
    ? `No agent will pick this up · it was not given to a run of ${ack.waitingFor}. Comment again to send it`
    : `No agent will pick this up · ${(ack.missed ?? []).join(", ")} does not hold this issue. Assign the issue to it to send this`;
  return { tone: "none", text, more: [], details: [] };
}
