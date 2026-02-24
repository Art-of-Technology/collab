"use client";

import React from "react";
import { cn } from "@/lib/utils";
import IssueCard from "./IssueCard";

interface SearchResult {
  id: string;
  issueKey: string;
  title: string;
  status?: string;
  statusColor?: string;
  priority?: string;
}

interface SearchResultsListProps {
  results: SearchResult[];
  totalCount?: number;
  onSelectIssue?: (issueKey: string) => void;
}

export default function SearchResultsList({
  results,
  totalCount,
  onSelectIssue,
}: SearchResultsListProps) {
  if (results.length === 0) {
    return (
      <div className="p-3 rounded-lg bg-[#1f1f1f]/60 border border-[#27272a] text-center">
        <p className="text-xs text-[#71717a]">No results found</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] text-[#52525b] font-medium uppercase tracking-wider">
          Search Results
        </span>
        {totalCount && totalCount > results.length && (
          <span className="text-[10px] text-[#52525b]">
            Showing {results.length} of {totalCount}
          </span>
        )}
      </div>
      {results.map((result) => (
        <IssueCard
          key={result.id}
          issueKey={result.issueKey}
          title={result.title}
          status={result.status}
          statusColor={result.statusColor}
          priority={result.priority}
          onClick={() => onSelectIssue?.(result.issueKey)}
        />
      ))}
    </div>
  );
}
