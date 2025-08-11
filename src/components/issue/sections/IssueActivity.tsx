"use client";

import BoardItemActivityHistory from "@/components/activity/BoardItemActivityHistory";

interface IssueActivityProps {
  issueId: string;
}

export function IssueActivity({ issueId }: IssueActivityProps) {
  return (
    <BoardItemActivityHistory 
      itemType="ISSUE" 
      itemId={issueId} 
      limit={50}
      className="border-0 bg-transparent"
    />
  );
}
