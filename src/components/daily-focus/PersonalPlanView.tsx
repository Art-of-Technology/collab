"use client";

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, TrendingUp, Clock, CheckCircle2, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import type { TeamMemberSync, IssueActivity } from '@/utils/teamSyncAnalyzer';

interface PersonalPlanViewProps {
  userSync: TeamMemberSync;
  workspaceSlug: string;
  date: Date;
}

export function PersonalPlanView({
  userSync,
  workspaceSlug,
  date,
}: PersonalPlanViewProps) {
  const insights = userSync.insights;

  // Calculate completion rate
  const totalYesterday = userSync.yesterday.length;
  const completedYesterday = userSync.yesterday.filter(
    i => i.statusSymbol === '✅'
  ).length;
  const completionRate =
    totalYesterday > 0 ? (completedYesterday / totalYesterday) * 100 : 0;

  // Group today's tasks by priority
  const highPriorityToday = userSync.today.filter(
    i => i.priority === 'URGENT' || i.priority === 'HIGH'
  );
  const mediumPriorityToday = userSync.today.filter(
    i => i.priority === 'MEDIUM'
  );
  const lowPriorityToday = userSync.today.filter(
    i => i.priority === 'LOW' || !i.priority
  );

  const formattedDate = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">My Plan</h2>
          <p className="text-sm text-gray-400">{formattedDate}</p>
        </div>
      </div>

      {/* Insights Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Tasks In Progress */}
        <Card className="p-4 bg-[#1a1a1a] border-[#2a2a2a]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold text-white">
                {insights.tasksInProgress}
              </div>
              <div className="text-sm text-gray-400">In Progress</div>
            </div>
            <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center">
              <Clock className="h-5 w-5 text-blue-400" />
            </div>
          </div>
        </Card>

        {/* Completed Today */}
        <Card className="p-4 bg-[#1a1a1a] border-[#2a2a2a]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold text-white">
                {insights.tasksCompletedToday}
              </div>
              <div className="text-sm text-gray-400">Completed</div>
            </div>
            <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-green-400" />
            </div>
          </div>
        </Card>

        {/* Completion Rate */}
        <Card className="p-4 bg-[#1a1a1a] border-[#2a2a2a]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold text-white">
                {completionRate.toFixed(0)}%
              </div>
              <div className="text-sm text-gray-400">Completion Rate</div>
            </div>
            <div className="h-10 w-10 rounded-full bg-purple-500/20 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-purple-400" />
            </div>
          </div>
          <Progress value={completionRate} className="mt-2 h-1" />
        </Card>

        {/* High Priority */}
        <Card className="p-4 bg-[#1a1a1a] border-[#2a2a2a]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold text-white">
                {highPriorityToday.length}
              </div>
              <div className="text-sm text-gray-400">High Priority</div>
            </div>
            <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center">
              <Flame className="h-5 w-5 text-red-400" />
            </div>
          </div>
        </Card>
      </div>

      {/* Warnings & Insights */}
      {insights.warnings.length > 0 && (
        <Card className="p-4 bg-yellow-500/10 border-yellow-500/20">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-yellow-400 mb-2">
                Insights & Recommendations
              </h3>
              <ul className="space-y-1">
                {insights.warnings.map((warning, idx) => (
                  <li key={idx} className="text-sm text-yellow-300">
                    • {warning}
                  </li>
                ))}
              </ul>
              {insights.tasksInProgress >= 3 && (
                <div className="mt-2 text-xs text-yellow-400">
                  💡 Tip: Focus on completing 1-2 tasks before starting new ones
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Yesterday's Work */}
      {userSync.yesterday.length > 0 && (
        <Card className="p-4 bg-[#1a1a1a] border-[#2a2a2a]">
          <h3 className="text-lg font-semibold text-white mb-3">Yesterday's Work</h3>
          <div className="space-y-2">
            {userSync.yesterday.map((issue) => (
              <IssueRow
                key={issue.issueId}
                issue={issue}
                workspaceSlug={workspaceSlug}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Today's Plan */}
      <div className="space-y-4">
        {/* High Priority */}
        {highPriorityToday.length > 0 && (
          <Card className="p-4 bg-[#1a1a1a] border-red-500/30">
            <div className="flex items-center gap-2 mb-3">
              <Flame className="h-5 w-5 text-red-400" />
              <h3 className="text-lg font-semibold text-white">
                High Priority ({highPriorityToday.length})
              </h3>
            </div>
            <div className="space-y-2">
              {highPriorityToday.map((issue) => (
                <IssueRow
                  key={issue.issueId}
                  issue={issue}
                  workspaceSlug={workspaceSlug}
                  showPriority
                />
              ))}
            </div>
          </Card>
        )}

        {/* Regular Tasks */}
        {(mediumPriorityToday.length > 0 || lowPriorityToday.length > 0) && (
          <Card className="p-4 bg-[#1a1a1a] border-[#2a2a2a]">
            <h3 className="text-lg font-semibold text-white mb-3">
              Tasks ({mediumPriorityToday.length + lowPriorityToday.length})
            </h3>
            <div className="space-y-2">
              {[...mediumPriorityToday, ...lowPriorityToday].map((issue) => (
                <IssueRow
                  key={issue.issueId}
                  issue={issue}
                  workspaceSlug={workspaceSlug}
                />
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Blockers */}
      {userSync.blockers.length > 0 && (
        <Card className="p-4 bg-[#1a1a1a] border-orange-500/30">
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-400" />
            Blockers ({userSync.blockers.length})
          </h3>
          <div className="space-y-2">
            {userSync.blockers.map((issue) => (
              <IssueRow
                key={issue.issueId}
                issue={issue}
                workspaceSlug={workspaceSlug}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Empty State */}
      {userSync.today.length === 0 && userSync.yesterday.length === 0 && (
        <Card className="p-12 bg-[#1a1a1a] border-[#2a2a2a]">
          <div className="text-center">
            <CheckCircle2 className="h-12 w-12 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">
              No activities today
            </h3>
            <p className="text-sm text-gray-400">
              There are no issues in progress or completed
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

interface IssueRowProps {
  issue: IssueActivity;
  workspaceSlug: string;
  showPriority?: boolean;
}

function IssueRow({ issue, workspaceSlug, showPriority }: IssueRowProps) {
  return (
    <div className="flex items-start gap-3 p-3 rounded bg-[#0f0f0f] hover:bg-[#151515] transition-colors">
      {issue.statusSymbol && (
        <span className="text-lg flex-shrink-0 mt-0.5">{issue.statusSymbol}</span>
      )}
      
      <div className="flex-1 min-w-0">
        <Link
          href={`/${workspaceSlug}/issues/${issue.issueKey}`}
          className="text-sm text-white hover:text-blue-400 font-medium block truncate"
        >
          {issue.issueKey} - {issue.title}
        </Link>
        
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-gray-500">{issue.projectName}</span>
          
          {issue.daysInProgress && issue.daysInProgress > 0 && (
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                issue.daysInProgress >= 5
                  ? "border-red-500/50 text-red-400"
                  : issue.daysInProgress >= 3
                  ? "border-orange-500/50 text-orange-400"
                  : "border-blue-500/50 text-blue-400"
              )}
            >
              {issue.daysInProgress}d
            </Badge>
          )}
          
          {showPriority && issue.priority && (
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                issue.priority === 'URGENT' && "border-red-500/50 text-red-400",
                issue.priority === 'HIGH' && "border-orange-500/50 text-orange-400"
              )}
            >
              {issue.priority}
            </Badge>
          )}
        </div>
        
        {issue.notes && (
          <div className="text-xs text-gray-400 mt-1 italic">{issue.notes}</div>
        )}
      </div>
    </div>
  );
}


