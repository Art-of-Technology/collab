"use client";

import { useState, useMemo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  ChevronDown, 
  ChevronRight, 
  AlertCircle,
  CheckCircle2,
  PlayCircle,
  Clock,
  Eye,
  Target,
  ExternalLink
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { IssueStatusBadge, StatusIcon, emojiToStatusCategory } from './IssueStatusBadge';
import type { TeamMemberRangeSync, DayActivity, IssueActivity } from '../types';
import { format } from 'date-fns';

interface PlanningMemberRowProps {
  member: TeamMemberRangeSync;
  workspaceSlug: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  selectedDate?: string; // For day view, which day to show
  showAllDays?: boolean; // For week view
}

interface IssueRowProps {
  issue: IssueActivity;
  workspaceSlug: string;
  compact?: boolean;
}

function IssueRow({ issue, workspaceSlug, compact = false }: IssueRowProps) {
  const statusCategory = emojiToStatusCategory(issue.statusSymbol);
  
  return (
    <div className={cn(
      "group flex items-center gap-2 rounded transition-colors",
      compact ? "px-2 py-1.5" : "px-3 py-2",
      "hover:bg-[#1e1e1e]"
    )}>
      <StatusIcon status={statusCategory} size="sm" />
      
      <Link
        href={`/${workspaceSlug}/issues/${issue.issueKey}`}
        className={cn(
          "font-mono text-gray-400 hover:text-blue-400 transition-colors flex-shrink-0",
          compact ? "text-xs" : "text-xs"
        )}
      >
        {issue.issueKey}
      </Link>
      
      <span className={cn(
        "text-gray-300 truncate flex-1",
        compact ? "text-xs" : "text-sm"
      )}>
        {issue.title}
      </span>
      
      <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {issue.daysInProgress && issue.daysInProgress > 0 && (
          <Badge 
            variant="outline" 
            className={cn(
              "text-xs h-5 px-1.5 border-0",
              issue.daysInProgress >= 5 
                ? "bg-red-500/10 text-red-400" 
                : issue.daysInProgress >= 3 
                  ? "bg-orange-500/10 text-orange-400" 
                  : "bg-gray-500/10 text-gray-400"
            )}
          >
            {issue.daysInProgress}d
          </Badge>
        )}
        
        {issue.priority && ['URGENT', 'HIGH'].includes(issue.priority) && (
          <Badge 
            variant="outline" 
            className={cn(
              "text-xs h-5 px-1.5 border-0",
              issue.priority === 'URGENT' 
                ? "bg-red-500/10 text-red-400" 
                : "bg-orange-500/10 text-orange-400"
            )}
          >
            {issue.priority}
          </Badge>
        )}
        
        <Link
          href={`/${workspaceSlug}/issues/${issue.issueKey}`}
          className="text-gray-500 hover:text-gray-300"
        >
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function DaySectionHeader({ 
  title, 
  count, 
  icon,
  color 
}: { 
  title: string; 
  count: number; 
  icon: React.ReactNode;
  color: string;
}) {
  if (count === 0) return null;
  
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <span className={cn("h-4 w-4", color, "[&>svg]:w-full [&>svg]:h-full")}>
        {icon}
      </span>
      <span className="text-xs font-medium text-gray-400">{title}</span>
      <Badge variant="secondary" className="h-4 px-1.5 text-xs bg-[#252525] text-gray-400 border-0">
        {count}
      </Badge>
    </div>
  );
}

export function PlanningMemberRow({
  member,
  workspaceSlug,
  isExpanded,
  onToggleExpand,
  selectedDate,
  showAllDays = false,
}: PlanningMemberRowProps) {
  const { summary, insights, days } = member;
  
  // Get the activity for the selected date or calculate totals for all days
  const displayActivity = useMemo(() => {
    if (selectedDate && days[selectedDate]) {
      return days[selectedDate];
    }
    
    // If showing all days or no specific date, aggregate
    const aggregated: DayActivity = {
      date: selectedDate || '',
      completed: [],
      started: [],
      inProgress: [],
      inReview: [],
      planned: [],
      movements: [],
    };
    
    const seenIssues = new Set<string>();
    
    Object.values(days).forEach(day => {
      day.completed.forEach(issue => {
        if (!seenIssues.has(issue.issueId)) {
          aggregated.completed.push(issue);
          seenIssues.add(issue.issueId);
        }
      });
      day.started.forEach(issue => {
        if (!seenIssues.has(issue.issueId)) {
          aggregated.started.push(issue);
          seenIssues.add(issue.issueId);
        }
      });
      aggregated.movements.push(...day.movements);
    });
    
    // Get current state (in progress, in review, planned) from the latest day
    const sortedDates = Object.keys(days).sort();
    const latestDay = sortedDates.length > 0 ? days[sortedDates[sortedDates.length - 1]] : null;
    if (latestDay) {
      aggregated.inProgress = latestDay.inProgress;
      aggregated.inReview = latestDay.inReview;
      aggregated.planned = latestDay.planned;
    }
    
    return aggregated;
  }, [days, selectedDate]);

  const completionProgress = summary.totalStarted > 0 
    ? (summary.totalCompleted / summary.totalStarted) * 100 
    : 0;

  const hasWarnings = insights.warnings.length > 0;

  return (
    <div className="bg-[#141414] rounded-lg border border-[#252525] overflow-hidden hover:border-[#333] transition-colors">
      {/* Member Header */}
      <button
        onClick={onToggleExpand}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[#1a1a1a] transition-colors"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Avatar className="h-9 w-9 flex-shrink-0">
            <AvatarImage src={member.userImage} />
            <AvatarFallback className="bg-[#252525] text-white text-sm">
              {member.userName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white truncate">
                {member.userName}
              </h3>
              {hasWarnings && (
                <div className="flex items-center gap-1 text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span className="text-xs">{insights.warnings.length}</span>
                </div>
              )}
            </div>
            
            {/* Quick Stats */}
            <div className="flex items-center gap-3 mt-0.5">
              <div className="flex items-center gap-1 text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                <span className="text-xs">{summary.totalCompleted}</span>
              </div>
              <div className="flex items-center gap-1 text-blue-400">
                <PlayCircle className="h-3 w-3" />
                <span className="text-xs">{summary.totalStarted}</span>
              </div>
              <div className="flex items-center gap-1 text-amber-400">
                <Clock className="h-3 w-3" />
                <span className="text-xs">{summary.currentWorkload}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-24 flex-shrink-0">
          <Progress 
            value={completionProgress} 
            className="h-1.5 bg-[#252525]"
          />
          <div className="text-xs text-gray-500 mt-0.5 text-right">
            {summary.completionRate}%
          </div>
        </div>

        {/* Expand/Collapse Icon */}
        {isExpanded ? (
          <ChevronDown className="h-5 w-5 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
        )}
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-[#252525]">
          {/* Warnings */}
          {hasWarnings && (
            <div className="px-4 py-2 bg-amber-500/5 border-b border-amber-500/20">
              {insights.warnings.map((warning, idx) => (
                <div key={idx} className="text-xs text-amber-400 flex items-start gap-2">
                  <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}

          {/* Issues by Category */}
          <div className="divide-y divide-[#1e1e1e]">
            {/* Completed */}
            {displayActivity.completed.length > 0 && (
              <div className="py-2">
                <DaySectionHeader 
                  title="Completed" 
                  count={displayActivity.completed.length}
                  icon={<CheckCircle2 />}
                  color="text-emerald-400"
                />
                <div className="space-y-0.5">
                  {displayActivity.completed.map(issue => (
                    <IssueRow 
                      key={issue.issueId} 
                      issue={issue} 
                      workspaceSlug={workspaceSlug}
                      compact
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Started */}
            {displayActivity.started.length > 0 && (
              <div className="py-2">
                <DaySectionHeader 
                  title="Started" 
                  count={displayActivity.started.length}
                  icon={<PlayCircle />}
                  color="text-blue-400"
                />
                <div className="space-y-0.5">
                  {displayActivity.started.map(issue => (
                    <IssueRow 
                      key={issue.issueId} 
                      issue={issue} 
                      workspaceSlug={workspaceSlug}
                      compact
                    />
                  ))}
                </div>
              </div>
            )}

            {/* In Progress */}
            {displayActivity.inProgress.length > 0 && (
              <div className="py-2">
                <DaySectionHeader 
                  title="In Progress" 
                  count={displayActivity.inProgress.length}
                  icon={<Clock />}
                  color="text-amber-400"
                />
                <div className="space-y-0.5">
                  {displayActivity.inProgress.map(issue => (
                    <IssueRow 
                      key={issue.issueId} 
                      issue={issue} 
                      workspaceSlug={workspaceSlug}
                      compact
                    />
                  ))}
                </div>
              </div>
            )}

            {/* In Review */}
            {displayActivity.inReview.length > 0 && (
              <div className="py-2">
                <DaySectionHeader 
                  title="In Review" 
                  count={displayActivity.inReview.length}
                  icon={<Eye />}
                  color="text-purple-400"
                />
                <div className="space-y-0.5">
                  {displayActivity.inReview.map(issue => (
                    <IssueRow 
                      key={issue.issueId} 
                      issue={issue} 
                      workspaceSlug={workspaceSlug}
                      compact
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Planned */}
            {displayActivity.planned.length > 0 && (
              <div className="py-2">
                <DaySectionHeader 
                  title="Planned" 
                  count={displayActivity.planned.length}
                  icon={<Target />}
                  color="text-cyan-400"
                />
                <div className="space-y-0.5">
                  {displayActivity.planned.map(issue => (
                    <IssueRow 
                      key={issue.issueId} 
                      issue={issue} 
                      workspaceSlug={workspaceSlug}
                      compact
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {displayActivity.completed.length === 0 && 
             displayActivity.started.length === 0 && 
             displayActivity.inProgress.length === 0 && 
             displayActivity.inReview.length === 0 && 
             displayActivity.planned.length === 0 && (
              <div className="py-8 text-center text-gray-500 text-sm">
                No activity for this period
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

