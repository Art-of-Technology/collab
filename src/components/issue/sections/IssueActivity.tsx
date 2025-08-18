"use client";

import { IssueActivitySection } from "./activity";

interface IssueActivityProps {
  issueId: string;
}

export function IssueActivity({ issueId }: IssueActivityProps) {
  return (
    <IssueActivitySection 
      issueId={issueId} 
      limit={50}
    />
  );
}
