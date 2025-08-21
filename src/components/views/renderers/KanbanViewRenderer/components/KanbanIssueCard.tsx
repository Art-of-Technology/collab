"use client";

import React, { useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  MessageSquare, 
  ArrowRight,
  User,
  Circle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Draggable } from "@hello-pangea/dnd";
import type { KanbanIssueCardProps } from '../types';

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

  const handleCardClick = useCallback(() => {
    const keyOrId = issue.issueKey || issue.id;
    onCardClick(keyOrId);
  }, [onCardClick, issue.issueKey, issue.id]);

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
              {issue.project && (
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
                  {new Date(issue.dueDate).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric' 
                  })}
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
            </div>

            {/* Bottom Meta Row: Comments, Subtasks */}
            <div className="flex items-center justify-between">
              <div className="flex-1"></div>

              {/* Meta indicators */}
              <div className="flex items-center gap-1.5 text-[#6e7681]">
                {issue._count?.comments > 0 && (
                  <div className="flex items-center gap-0.5">
                    <MessageSquare className="h-3 w-3" />
                    <span className="text-[10px] font-medium">{issue._count.comments}</span>
                  </div>
                )}
                
                {issue._count?.children > 0 && (
                  <div className="flex items-center gap-0.5">
                    <ArrowRight className="h-3 w-3" />
                    <span className="text-[10px] font-medium">{issue._count.children}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
});

KanbanIssueCard.displayName = 'KanbanIssueCard';

export default KanbanIssueCard;