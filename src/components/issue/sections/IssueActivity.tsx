"use client";

import { IssueActivitySection } from "./activity";
import { OpenRun } from "./activity/components/OpenRun";

interface IssueActivityProps {
  issueId: string;
}

export function IssueActivity({ issueId }: IssueActivityProps) {
  return (
    <>
      <OpenRun issueId={issueId} />
      <IssueActivitySection
        issueId={issueId}
        limit={50}
      />
    </>
  );
}
