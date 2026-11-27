"use client";

import { useState } from "react";
import { Ban, CheckCheck, CircleDashed } from "lucide-react";
import type { CommentAck as CommentAckState } from "@/lib/issue-comment-acks";
import { ackLine } from "../utils/commentAck";

const TONES = {
  acked: { Icon: CheckCheck, color: "text-emerald-400" },
  waiting: { Icon: CircleDashed, color: "text-collab-500" },
  none: { Icon: Ban, color: "text-amber-400" },
} as const;

interface CommentAckProps {
  ack?: CommentAckState | null;
  createdAt: string;
  updatedAt?: string;
}

/** The always-visible line under a person's comment: whether an agent seat has taken it in. */
export function CommentAck({ ack, createdAt, updatedAt }: CommentAckProps) {
  const [open, setOpen] = useState(false);
  if (!ack) return null;

  const line = ackLine(ack, createdAt, updatedAt);
  const { Icon, color } = TONES[line.tone];
  const content = (
    <>
      <Icon className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
      <span>{line.text}</span>
    </>
  );

  return (
    <div className={`mb-1 text-[11px] ${color}`}>
      {line.tone === "acked" ? (
        <button
          type="button"
          aria-expanded={open}
          title={ack.seats[0] ? new Date(ack.seats[0].at).toLocaleString() : undefined}
          onClick={() => setOpen(value => !value)}
          className="flex items-center gap-1 text-left hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-collab-500 rounded-sm"
        >
          {content}
        </button>
      ) : (
        <div className="flex items-center gap-1">{content}</div>
      )}
      {open && line.details.length > 0 && (
        <ul className="mt-0.5 ml-4 space-y-0.5 text-collab-500">
          {line.details.map((detail, index) => <li key={index}>{detail}</li>)}
        </ul>
      )}
      {line.more.length > 0 && (
        <ul className="mt-0.5 ml-4 space-y-0.5 text-collab-500">
          {line.more.map((item, index) => <li key={index}>{item}</li>)}
        </ul>
      )}
    </div>
  );
}
