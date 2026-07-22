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
      <div className="p-3 rounded-lg bg-collab-700/60 border border-collab-600 text-center">
        <p className="text-xs text-collab-500">No results found</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] text-collab-500/60 font-medium uppercase tracking-wider">
          Search Results
        </span>
        {totalCount && totalCount > results.length && (
          <span className="text-[10px] text-collab-500/60">
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
