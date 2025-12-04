"use client";

import { useState } from 'react';
import { DailyFocusPlan } from '@/hooks/queries/useDailyFocus';
import { IssueSearchSelector } from './IssueSearchSelector';
import { Plus, X, AlertTriangle, RefreshCw, Flame, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface PlanSectionProps {
  plans: DailyFocusPlan[];
  issues?: any[];
  workspaceId: string;
  workspaceSlug?: string;
  projectIds?: string[];
  isReadOnly?: boolean;
  onAddPlan?: (issueId: string) => void;
  onRemovePlan?: (planId: string) => void;
  onUpdateNotes?: (planId: string, notes: string) => void;
}

export function PlanSection({
  plans,
  issues = [],
  workspaceId,
  workspaceSlug,
  projectIds,
  isReadOnly = false,
  onAddPlan,
  onRemovePlan,
  onUpdateNotes,
}: PlanSectionProps) {
  const [showAddIssue, setShowAddIssue] = useState(false);
  const selectedIssueIds = plans.map(p => p.issueId);

  // Group plans by suggestion type (simplified - would be enhanced with actual detection)
  const overduePlans = plans.filter(p => {
    const issue = p.issue;
    if (!issue?.dueDate) return false;
    const dueDate = new Date(issue.dueDate);
    return dueDate < new Date() && issue.projectStatus?.name?.toLowerCase() !== 'done';
  });

  const highPriorityPlans = plans.filter(p => {
    const issue = p.issue;
    return issue?.priority === 'URGENT' || issue?.priority === 'HIGH';
  });

  const regularPlans = plans.filter(p => {
    const issue = p.issue;
    const isOverdue = issue?.dueDate && new Date(issue.dueDate) < new Date();
    const isHighPriority = issue?.priority === 'URGENT' || issue?.priority === 'HIGH';
    return !isOverdue && !isHighPriority;
  });

  return (
    <div className="h-full flex flex-col bg-[#0f0f0f]">
      {/* Header */}
      <div className="p-4 border-b border-[#1a1a1a]">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-white text-sm font-medium">Today's Plan</h3>
          {!isReadOnly && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAddIssue(!showAddIssue)}
              className="h-6 px-2 text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Issue
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>📋 {plans.length} planned</span>
          {overduePlans.length > 0 && (
            <span className="text-orange-400">⚠️ {overduePlans.length} overdue</span>
          )}
          {highPriorityPlans.length > 0 && (
            <span className="text-red-400">🔥 {highPriorityPlans.length} high priority</span>
          )}
        </div>
      </div>

      {/* Add Issue Selector */}
      {showAddIssue && !isReadOnly && (
        <div className="p-4 border-b border-[#1a1a1a] bg-[#0a0a0a]">
          <IssueSearchSelector
            workspaceId={workspaceId}
            projectIds={projectIds}
            selectedIssueIds={selectedIssueIds}
            onSelectIssue={(issueId) => {
              onAddPlan?.(issueId);
              setShowAddIssue(false);
            }}
            placeholder="Search and select issue..."
          />
        </div>
      )}

      {/* Plans List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Overdue Section */}
        {overduePlans.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-orange-400 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Overdue</span>
              <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                {overduePlans.length}
              </Badge>
            </div>
            <div className="space-y-1 ml-6">
              {overduePlans.map((plan) => (
                <PlanItem
                  key={plan.id}
                  plan={plan}
                  workspaceSlug={workspaceSlug}
                  isReadOnly={isReadOnly}
                  onRemove={onRemovePlan}
                  onUpdateNotes={onUpdateNotes}
                />
              ))}
            </div>
          </div>
        )}

        {/* High Priority Section */}
        {highPriorityPlans.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-red-400 font-medium">
              <Flame className="h-3.5 w-3.5" />
              <span>High Priority</span>
              <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                {highPriorityPlans.length}
              </Badge>
            </div>
            <div className="space-y-1 ml-6">
              {highPriorityPlans.map((plan) => (
                <PlanItem
                  key={plan.id}
                  plan={plan}
                  workspaceSlug={workspaceSlug}
                  isReadOnly={isReadOnly}
                  onRemove={onRemovePlan}
                  onUpdateNotes={onUpdateNotes}
                />
              ))}
            </div>
          </div>
        )}

        {/* Regular Plans */}
        {regularPlans.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-gray-400 font-medium">
              <span>Planned</span>
              <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                {regularPlans.length}
              </Badge>
            </div>
            <div className="space-y-1 ml-6">
              {regularPlans.map((plan) => (
                <PlanItem
                  key={plan.id}
                  plan={plan}
                  workspaceSlug={workspaceSlug}
                  isReadOnly={isReadOnly}
                  onRemove={onRemovePlan}
                  onUpdateNotes={onUpdateNotes}
                />
              ))}
            </div>
          </div>
        )}

        {plans.length === 0 && (
          <div className="text-center py-8 text-gray-500 text-sm">
            No plans yet. Add issues you plan to work on today.
          </div>
        )}
      </div>
    </div>
  );
}

function PlanItem({
  plan,
  workspaceSlug,
  isReadOnly,
  onRemove,
  onUpdateNotes,
}: {
  plan: DailyFocusPlan;
  workspaceSlug?: string;
  isReadOnly: boolean;
  onRemove?: (planId: string) => void;
  onUpdateNotes?: (planId: string, notes: string) => void;
}) {
  return (
    <div className="group p-2 rounded bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#3a3a3a] transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />
            <Link
              href={`/${workspaceSlug}/issues/${plan.issue?.issueKey || plan.issueId}`}
              className="text-white text-sm font-medium hover:text-blue-400 truncate"
            >
              {plan.issue?.title || `Issue ${plan.issueId}`}
            </Link>
          </div>
          {plan.issue?.project && (
            <div className="text-xs text-gray-500 mb-1">
              {plan.issue.project.name}
            </div>
          )}
          {plan.issue?.assignee && (
            <div className="flex items-center gap-1 mb-1">
              <Avatar className="h-4 w-4">
                <AvatarImage src={plan.issue.assignee.image} />
                <AvatarFallback className="text-[8px] bg-[#2a2a2a] text-white">
                  {plan.issue.assignee.name?.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-gray-400">
                {plan.issue.assignee.name}
              </span>
            </div>
          )}
          {plan.notes && (
            <div className="text-xs text-gray-400 mt-1">
              {plan.notes}
            </div>
          )}
        </div>
        
        {!isReadOnly && onRemove && (
          <button
            onClick={() => onRemove(plan.id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-400"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

