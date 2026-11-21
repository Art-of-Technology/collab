"use client";

import { useState } from "react";
import { IssueActivitySection } from "./activity";
import { OpenRun } from "./activity/components/OpenRun";

interface IssueActivityProps {
  issueId: string;
}

export function IssueActivity({ issueId }: IssueActivityProps) {
  const [answers, setAnswers] = useState(0);
  return (
    <>
      <OpenRun key={issueId} issueId={issueId} onAnswered={() => setAnswers(count => count + 1)} />
      <IssueActivitySection
        key={answers}
        issueId={issueId}
        limit={50}
      />
    </>
  );
}
