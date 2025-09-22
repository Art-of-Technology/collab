"use client";

import React, { useCallback, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  MessageSquare,
  ChevronDown,
  ChevronRight,
  User,
  Circle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Draggable } from "@hello-pangea/dnd";
import type { KanbanIssueCardProps } from '../types';
import { format } from 'date-fns';
import { getStatusBadgeStyle } from '@/components/issue/sections/relations/utils/relationHelpers';

// Helper functions for issue styling
const getTypeColor = (type: string) => {
  const colors = {
    'EPIC': '#8b5cf6',
    'STORY': '#3b82f6', 
    'TASK': '#10b981',
    'BUG': '#ef4444',
    'MILESTONE': '#f59e0b',
    'SUBTASK': '#6b7280'
  };
  return colors[type as keyof typeof colors] || '#6b7280';
};

const getPriorityColor = (priority: string) => {
  const colors = {
    'URGENT': '#ef4444',
    'HIGH': '#f97316', 
    'MEDIUM': '#eab308',
    'LOW': '#22c55e'
  };
  return colors[priority as keyof typeof colors] || '#6b7280';
};

const KanbanIssueCard = React.memo(({
  issue,
  index,
  displayProperties,
  onCardClick
}: KanbanIssueCardProps) => {
  const showAssignee = displayProperties.includes('Assignee');
  const showPriority = displayProperties.includes('Priority');
  const showLabels = displayProperties.includes('Labels');
  const showDueDate = displayProperties.includes('Due Date');
  const showStoryPoints = displayProperties.includes('Story Points');
  const showReporter = displayProperties.includes('Reporter');
  const showProject = displayProperties.includes('Project');
  const showStatus = displayProperties.includes('Status');
  const showCreated = displayProperties.includes('Created');
  const showUpdated = displayProperties.includes('Updated');

  const subTasks = Array.isArray(issue.children)
    ? issue.children
    : Array.isArray(issue.subtasks)
      ? issue.subtasks
      : [];
  const hasSubTasks = subTasks.length > 0;
  const [isExpanded, setIsExpanded] = useState(false);
  const subTaskCount = hasSubTasks ? subTasks.length : issue._count?.children || 0;

  React.useEffect(() => {
    setIsExpanded(false);
  }, [issue.id]);

  const handleCardClick = useCallback(() => {
    const keyOrId = issue.issueKey || issue.id;
    onCardClick(keyOrId);
  }, [onCardClick, issue.issueKey, issue.id]);

  const handleToggleSubtasks = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!hasSubTasks) return;
    setIsExpanded(prev => !prev);
  }, [hasSubTasks]);

  const handleSubtaskClick = useCallback((subtask: any, event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const keyOrId = subtask.issueKey || subtask.id;
    if (keyOrId) {
      onCardClick(keyOrId);
    }
  }, [onCardClick]);

  return (
    <Draggable key={issue.id} draggableId={issue.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={cn(
            "group p-3 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg hover:border-[#333] transition-all duration-150 cursor-pointer",
            snapshot.isDragging && "shadow-xl ring-2 ring-blue-500/30 bg-[#0f0f0f] scale-[1.02]"
          )}
          onClick={handleCardClick}
        >
          {/* Header: Issue ID + Type Indicator + Priority + Assignee */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {/* Issue Key - More readable */}
              <span className="text-xs font-mono text-[#8b949e] font-medium">
                {issue.issueKey}
              </span>
              
              {/* Type Indicator */}
              <div 
                className="h-2 w-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: getTypeColor(issue.type) }}
              />
              
              {/* Priority Indicator - Only show if enabled and not medium */}
              {showPriority && issue.priority && issue.priority !== 'MEDIUM' && (
                <div 
                  className="h-2 w-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: getPriorityColor(issue.priority) }}
                />
              )}
            </div>
            
            {/* Assignee Avatar - Only show if enabled */}
            {showAssignee && (
              <div className="flex-shrink-0">
                {issue.assignee ? (
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={issue.assignee.image} />
                    <AvatarFallback className="text-[10px] bg-[#1f1f1f] text-[#8b949e] font-medium">
                      {issue.assignee.name?.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="h-5 w-5 rounded-full bg-[#1f1f1f] flex items-center justify-center">
                    <User className="h-2.5 w-2.5 text-[#6e7681]" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Issue Title */}
          <h4 className="text-white text-sm font-medium leading-5 mb-2 line-clamp-2 group-hover:text-[#58a6ff] transition-colors">
            {issue.title}
          </h4>

          {/* All Badges Row: Labels, Project, Due Date, Story Points, Reporter - Flex Wrap */}
          <div className="space-y-1.5">
            {/* All Badges in Flex Wrap Container */}
            <div className="flex flex-wrap gap-1 items-center">
              {/* Labels */}
              {showLabels && issue.labels && issue.labels.length > 0 && (
                <>
                  {issue.labels.slice(0, 3).map((label: any) => (
                    <Badge 
                      key={label.id}
                      className="kanban-badge h-4 px-1.5 text-[10px] font-medium leading-none border-0 rounded-sm"
                      style={{ 
                        backgroundColor: label.color + '25',
                        color: label.color || '#8b949e'
                      }}
                    >
                      {label.name}
                    </Badge>
                  ))}
                  {issue.labels.length > 3 && (
                    <span className="text-[10px] text-[#6e7681] px-1">+{issue.labels.length - 3}</span>
                  )}
                </>
              )}

              {/* Project Badge */}
              {showProject && issue.project && (
                <Badge 
                  className="kanban-badge h-4 px-1.5 text-[10px] font-medium leading-none border-0 rounded-sm"
                  style={{ 
                    backgroundColor: (issue.project.color || '#6e7681') + '25',
                    color: issue.project.color || '#8b949e'
                  }}
                >
                  {issue.project.name}
                </Badge>
              )}

              {/* Due Date */}
              {showDueDate && issue.dueDate && (
                <Badge className="kanban-badge h-4 px-1.5 text-[10px] font-medium leading-none bg-orange-500/20 text-orange-400 border-0 rounded-sm">
                  {format(new Date(issue.dueDate), 'MMM d')}
                </Badge>
              )}

              {/* Story Points */}
              {showStoryPoints && issue.storyPoints && (
                <Badge className="kanban-badge h-4 px-1.5 text-[10px] font-medium leading-none bg-blue-500/20 text-blue-400 border-0 rounded-sm">
                  {issue.storyPoints} pts
                </Badge>
              )}

              {/* Reporter Badge */}
              {showReporter && issue.reporter && (
                <Badge className="kanban-badge h-4 px-1.5 text-[10px] font-medium leading-none bg-purple-500/20 text-purple-400 border-0 rounded-sm">
                  {issue.reporter.name}
                </Badge>
              )}

              {/* Status Badge */}
              {showStatus && (issue.projectStatus?.displayName || issue.status || issue.statusValue) && (
                <Badge className="kanban-badge h-4 px-1.5 text-[10px] font-medium leading-none bg-gray-500/20 text-gray-300 border-0 rounded-sm">
                  {issue.projectStatus?.displayName || issue.status || issue.statusValue}
                </Badge>
              )}

              {/* Created */}
              {showCreated && issue.createdAt && (
                <Badge className="kanban-badge h-4 px-1.5 text-[10px] font-medium leading-none bg-gray-500/20 text-gray-300 border-0 rounded-sm">
                  Created {format(new Date(issue.createdAt), 'MMM d')}
                </Badge>
              )}

              {/* Updated */}
              {showUpdated && issue.updatedAt && (
                <Badge className="kanban-badge h-4 px-1.5 text-[10px] font-medium leading-none bg-gray-500/20 text-gray-300 border-0 rounded-sm">
                  Updated {format(new Date(issue.updatedAt), 'MMM d')}
                </Badge>
              )}
            </div>

            {/* Bottom Meta Row: Comments, Subtasks */}
            <div className="flex items-center justify-between">
              <div>
                {hasSubTasks && (
                  <button
                    type="button"
                    onClick={handleToggleSubtasks}
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} sub-tasks for ${issue.issueKey || issue.title || 'issue'}`}
                    className="flex items-center gap-1 text-[#8b949e] hover:text-white text-[11px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 rounded-sm"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    <span>Sub-tasks</span>
                    <span className="inline-flex items-center justify-center min-w-[1.25rem] rounded-full bg-[#1f1f1f] px-1 text-[10px] text-[#c9d1d9]">
                      {subTaskCount}
                    </span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-[#6e7681]">
                {issue._count?.comments > 0 && (
                  <div className="flex items-center gap-0.5">
                    <MessageSquare className="h-3 w-3" />
                    <span className="text-[10px] font-medium">{issue._count.comments}</span>
                  </div>
                )}
              </div>
            </div>

            {hasSubTasks && isExpanded && (
              <ul className="mt-3 space-y-2 border-l border-[#1f1f1f] pl-3">
                {subTasks.map((subtask: any) => {
                  const statusLabel = subtask.projectStatus?.displayName || subtask.status || subtask.statusValue || 'Todo';

                  return (
                    <li
                      key={subtask.id}
                      className="flex items-center gap-2 justify-between text-[#c9d1d9]"
                    >
                      <button
                        type="button"
                        onClick={(event) => handleSubtaskClick(subtask, event)}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left text-xs hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 rounded-sm"
                      >
                        {subtask.issueKey && (
                          <span className="text-[10px] font-mono text-[#8b949e] flex-shrink-0">
                            {subtask.issueKey}
                          </span>
                        )}
                        <span className="truncate leading-4">{subtask.title || 'Untitled sub-task'}</span>
                      </button>

                      {statusLabel && (
                        <Badge
                          className={cn(
                            "kanban-badge h-4 px-1.5 text-[10px] font-medium leading-none rounded-sm",
                            getStatusBadgeStyle(statusLabel)
                          )}
                        >
                          {statusLabel}
                        </Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
});

KanbanIssueCard.displayName = 'KanbanIssueCard';

export default KanbanIssueCard;