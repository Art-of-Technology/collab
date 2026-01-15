"use client";

import React, { useCallback, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  MessageSquare,
  ArrowRight,
  User,
  ArrowDown,
  Minus,
  ArrowUp,
  Flag,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Draggable } from "@hello-pangea/dnd";
import type { KanbanIssueCardProps } from '../types';
import { format } from 'date-fns';
import { ISSUE_TYPE_CONFIG } from '@/constants/issue-types';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/context/WorkspaceContext';
import {
  normalizeIssueRelations,
  RELATION_TYPE_LABELS,
  mapToIssueTypeKey
} from '@/utils/issueRelations';
import { ParentIssueBadgeMinimal } from '@/components/issue/ParentIssueBadge';


const KanbanIssueCard = React.memo(({
  issue,
  index,
  displayProperties,
  operationsInProgress,
  onCardClick
}: KanbanIssueCardProps) => {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  
  // Build URL for <a> tag
  const issueUrl = useMemo(() => {
    const workspaceSlug = currentWorkspace?.slug || (issue as any)?.workspaceId;
    if (workspaceSlug) {
      return `/${workspaceSlug}/issues/${issue.issueKey || issue.id}`;
    }
    return `/issues/${issue.issueKey || issue.id}`;
  }, [currentWorkspace?.slug, issue.issueKey, issue.id]);
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

  const [areRelationsCollapsed, setAreRelationsCollapsed] = useState(true);
  const relations = useMemo(() => normalizeIssueRelations(issue), [issue]);
  const relationCount = relations.length;
  const hasRelations = relationCount > 0;

  const handleToggleRelations = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setAreRelationsCollapsed(prev => !prev);
  }, []);

  const handleRelationsPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleLinkClick = useCallback((event: React.MouseEvent) => {
    // For normal clicks, prevent default and open programmatically
    // Ctrl/Cmd+click will use native browser behavior
    if (!event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      onCardClick(issue.issueKey || issue.id, event);
    }
  }, [onCardClick, issue.issueKey, issue.id]);

  const issueTypeKey = mapToIssueTypeKey(issue.type);
  const typeConfig = ISSUE_TYPE_CONFIG[issueTypeKey] || ISSUE_TYPE_CONFIG.TASK;
  const TypeIcon = typeConfig.icon;

  const isIssueBeingProcessed = operationsInProgress?.has(issue.id) || false;

  const isLabelsVisible = showLabels && issue.labels && issue.labels.length > 0;
  const isProjectVisible = showProject && issue.project;
  const isDueDateVisible = showDueDate && issue.dueDate;
  const isStoryPointsVisible = showStoryPoints && issue.storyPoints;
  const isReporterVisible = showReporter && issue.reporter;
  const isStatusVisible = showStatus && (issue.projectStatus?.displayName || issue.status || issue.statusValue)
  const isCreatedVisible = showCreated && issue.createdAt;
  const isTagsVisible = isLabelsVisible || isProjectVisible || isDueDateVisible || isStoryPointsVisible || isReporterVisible || isStatusVisible || isCreatedVisible;

  return (
    <Draggable key={issue.id} draggableId={issue.id} index={index} isDragDisabled={isIssueBeingProcessed}>
      {(provided, snapshot) => (
        <a
          ref={provided.innerRef}
          {...provided.draggableProps}
          href={issueUrl}
          rel="noopener noreferrer"
          onClick={handleLinkClick}
          data-issue-id={issue.id}
          className={cn(
            "group block p-3 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg transition-colors duration-150 no-underline",
            hasRelations ? 'pb-1.5' : 'pb-3',
            isIssueBeingProcessed
              ? "opacity-60 cursor-not-allowed"
              : "hover:border-[#333] cursor-pointer",
            snapshot.isDragging && "shadow-xl ring-2 ring-blue-500/30 bg-[#0f0f0f] scale-[1.02]"
          )}
        >
          <div
            {...provided.dragHandleProps}
            className="flex flex-col gap-1.5"
          >
            {/* Header: Issue ID + Type Indicator + Priority + Assignee */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Type Indicator */}
                <TypeIcon
                  className="h-3 w-3 flex-shrink-0"
                  style={{ color: typeConfig.color }}
                />

                {/* Priority Indicator - Only show if enabled and not medium */}
                {showPriority && issue.priority && (
                  <>
                    {issue.priority === 'MEDIUM' && <Minus className="h-3 w-3 text-blue-600" />}
                    {issue.priority === 'URGENT' && <Flag className="h-3 w-3 text-red-600" />}
                    {issue.priority === 'HIGH' && <ArrowUp className="h-3 w-3 text-amber-600" />}
                    {issue.priority === 'LOW' && <ArrowDown className="h-3 w-3 text-slate-500" />}
                  </>
                )}
                {/* Issue Key - More readable */}
                <span className="text-xs font-mono text-[#8b949e] font-medium">
                  {issue.issueKey}
                </span>
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
            <h4 className="text-white text-sm font-medium leading-5 line-clamp-2 group-hover:text-[#58a6ff] transition-colors">
              {issue.title}
            </h4>

            {/* Parent Issue Badge */}
            {(issue as any).parent && (
              <div className="mt-1">
                <ParentIssueBadgeMinimal
                  parent={(issue as any).parent}
                  workspaceSlug={currentWorkspace?.slug || (issue as any)?.workspaceId}
                  asButton={true}
                />
              </div>
            )}

            {/* All Badges Row: Labels, Project, Due Date, Story Points, Reporter - Flex Wrap */}
            <div className="flex flex-row justify-between gap-2">
              {/* All Badges in Flex Wrap Container */}
              <div className={cn("flex flex-wrap gap-1 items-center",
                isTagsVisible && "mb-1.5"
              )}>
                {/* Labels */}
                {isLabelsVisible && (
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
                {isProjectVisible && (
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
                {isDueDateVisible && (
                  <Badge className="kanban-badge h-4 px-1.5 text-[10px] font-medium leading-none bg-orange-500/20 text-orange-400 border-0 rounded-sm">
                    {format(new Date(issue.dueDate), 'MMM d')}
                  </Badge>
                )}

                {/* Story Points */}
                {isStoryPointsVisible && (
                  <Badge className="kanban-badge h-4 px-1.5 text-[10px] font-medium leading-none bg-blue-500/20 text-blue-400 border-0 rounded-sm">
                    {issue.storyPoints} pts
                  </Badge>
                )}

                {/* Reporter Badge */}
                {isReporterVisible && (
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
                {issue._count?.comments > 0 && (
                  <div className="flex items-center gap-0.5">
                    <MessageSquare className="h-3 w-3" />
                    <span className="text-[10px] font-medium">{issue._count.comments}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {hasRelations && (
            <>
              <hr className="border-[#1f1f1f] my-0 mt-0 mb-1.5" />
              <Button
                type="button"
                variant="ghost"
                className="group flex w-fit items-center justify-between rounded-md bg-transparent pl-0 pr-4 py-0 text-[11px] text-[#8b949e] transition-colors h-auto hover:bg-transparent"
                onClick={handleToggleRelations}
                onPointerDown={handleRelationsPointerDown}
              >
                <span className="flex items-center justify-center">
                  {areRelationsCollapsed ? (
                    <ChevronRight className="h-3 w-3 relative -top-[0.5px] -left-1 text-[#6e7681]" />
                  ) : (
                    <ChevronDown className="h-3 w-3 relative -left-0.5 text-[#6e7681]" />
                  )}
                  <span className="uppercase tracking-wide text-[10px] text-[#6e7681] group-hover:text-white transition-colors flex items-center gap-2">
                    <span>{relationCount} Relation{relationCount === 1 ? '' : 's'}</span>
                  </span>
                </span>
              </Button>

              {!areRelationsCollapsed && (
                <div className="mt-1 flex flex-col gap-1">
                  {relations.map((relation) => {
                    const relationTypeConfig = ISSUE_TYPE_CONFIG[relation.issueType] ?? ISSUE_TYPE_CONFIG.TASK;
                    const RelationTypeIcon = relationTypeConfig.icon;
                    const relationLabel = RELATION_TYPE_LABELS[relation.relationType];
                    const fullTitle = relation.title?.trim() || 'Untitled issue';
                    const truncatedTitle = fullTitle.length > 20
                      ? `${fullTitle.slice(0, 17)}...`
                      : fullTitle;
                    return (
                      <div
                        key={relation.id}
                        onClick={(e) => {
                          if (!relation.issueKey) return;
                          const workspaceSlug = relation.workspaceSlug || currentWorkspace?.slug;
                          if (!workspaceSlug) return;
                          const url = `/${workspaceSlug}/issues/${relation.issueKey}`;
                          if (e.ctrlKey || e.metaKey) {
                            // Let native browser behavior handle Ctrl/Cmd+click
                            return;
                          }
                          e.preventDefault();
                          window.open(url, '_blank', 'noopener,noreferrer');
                        }}
                        onAuxClick={(e) => {
                          if (e.button === 1 && relation.issueKey) {
                            const workspaceSlug = relation.workspaceSlug || currentWorkspace?.slug;
                            if (workspaceSlug) {
                              window.open(`/${workspaceSlug}/issues/${relation.issueKey}`, '_blank', 'noopener,noreferrer');
                            }
                          }
                        }}
                        className="flex items-center transition-colors duration-150 justify-between gap-2 rounded-md border border-[#1a1a1a] bg-[#0f0f0f] px-2 py-1 cursor-pointer hover:bg-[#1a1a1a]"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <RelationTypeIcon
                            className="h-3.5 w-3.5 flex-shrink-0"
                            style={{ color: relationTypeConfig.color }}
                          />
                          <div className="min-w-0">
                            {relation.issueKey && (
                              <div className="text-[10px] font-mono text-[#8b949e] leading-3">
                                {relation.issueKey}
                              </div>
                            )}
                            <div className="text-[11px] text-white leading-4">
                              {truncatedTitle}
                            </div>
                          </div>

                        </div>
                        <Badge className={cn("h-5 px-1.5 text-[10px] font-medium leading-none border border-[#1f1f1f] bg-[#151515] text-[#d0d7de] hover:bg-[#1a1a1a]",
                          (relation.relationType === 'blocked_by' || relation.relationType === 'blocks') && "border-red-500/10 bg-red-500/5 text-red-400 hover:bg-red-500/10")}
                        >
                          {relationLabel}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </a>
      )}
    </Draggable>
  );
});

KanbanIssueCard.displayName = 'KanbanIssueCard';

export default KanbanIssueCard;
