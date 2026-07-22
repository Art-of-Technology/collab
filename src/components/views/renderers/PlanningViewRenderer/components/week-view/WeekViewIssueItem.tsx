"use client";

import { Button } from '@/components/ui/button';
import type { IssueActivity } from '../../types';

interface WeekViewIssueItemProps {
  issue: IssueActivity;
  onOpenModal: (issueId: string) => void;
}

export function WeekViewIssueItem({ issue, onOpenModal }: WeekViewIssueItemProps) {
  return (
    <Button
      variant="ghost"
      onClick={() => onOpenModal(issue.issueId)}
      className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-collab-800 transition-colors text-left group h-auto justify-start rounded-none"
    >
      <span className="text-[11px] text-collab-500 font-mono w-14 flex-shrink-0">
        {issue.issueKey}
      </span>
      <span className="text-[12px] text-collab-400 truncate flex-1 group-hover:text-collab-50 transition-colors">
        {issue.title}
      </span>
    </Button>
  );
}

