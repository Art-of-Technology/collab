"use client";

import { forwardRef, useCallback, useMemo, useState, type MutableRefObject } from "react";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Plus,
  GripVertical,
  AlertCircle,
  ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Draggable, Droppable } from "@hello-pangea/dnd";
import { getColumnColor } from '../utils';
import KanbanIssueCard from './KanbanIssueCard';
import QuickIssueCreate from './QuickIssueCreate';
import type { KanbanColumnProps } from '../types';
import { INITIAL_COLUMN_ITEMS, LOAD_MORE_INCREMENT } from '../constants';

const KanbanColumn = forwardRef<HTMLDivElement, KanbanColumnProps>(function KanbanColumn({
  column,
  hoverColumnId,
  index,
  groupField,
  displayProperties,
  isCreatingIssue,
  projects,
  workspaceId,
  currentUserId,
  draggedIssue,
  hoverState,
  operationsInProgress,
  onIssueClick,
  onStartCreatingIssue,
  onCancelCreatingIssue,
  onIssueCreated
}: KanbanColumnProps, ref) {

  const [visibleCount, setVisibleCount] = useState(INITIAL_COLUMN_ITEMS);
  const visibleIssues = useMemo(() => column.issues.slice(0, visibleCount), [column.issues, visibleCount]);
  const hiddenCount = column.issues.length - visibleIssues.length;

  const shouldShowDisabledState = hoverColumnId === column.id && !hoverState.canDrop;
  const cannotDropReason = useMemo(() => {
    return `Cannot drop issue from ${draggedIssue?.project?.name || 'different project'} here`;
  }, [draggedIssue?.project?.name]);
  const handleStartCreatingIssue = useCallback(() => {
    onStartCreatingIssue(column.id);
  }, [column.id, onStartCreatingIssue]);

  return (
    <Draggable key={column.id} draggableId={column.id} index={index}>
      {(provided, snapshot) => {
        const isDraggingOver = hoverColumnId === column.id;
        const setRefs = (node: HTMLDivElement | null) => {
          provided.innerRef(node);
          if (ref) {
            if (typeof ref === 'function') {
              ref(node);
            } else {
              (ref as MutableRefObject<HTMLDivElement | null>).current = node;
            }
          }
        };
        return (
          <div
            ref={setRefs}
            {...provided.draggableProps}
            data-column-id={column.id}
            data-column-index={index}
            className={cn(
              "flex-shrink-0 w-80 flex flex-col h-full",
              snapshot.isDragging && "rotate-2 shadow-lg"
            )}
          >
            {/* Column Header */}
            <div
              {...provided.dragHandleProps}
              className={cn(
                "flex items-center justify-between px-4 py-3 border-b border-collab-700 mb-3 cursor-grab active:cursor-grabbing"
              )}
            >
              <div className="flex items-center gap-3">
                <GripVertical className="h-4 w-4 text-collab-500" />
                <h3 className="text-sm font-medium text-collab-50">
                  {column.name}
                </h3>
                <Badge variant="secondary" className="h-5 text-[10px] bg-collab-700 text-collab-400 border-0">
                  {column.issues.length}
                </Badge>
                {shouldShowDisabledState && (
                  <div title={cannotDropReason}>
                    <AlertCircle className="h-4 w-4 text-red-400 ml-2" />
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-collab-500 hover:text-white"
                onClick={handleStartCreatingIssue}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Column Content */}
            <Droppable droppableId={column.id} type="issue">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={cn(
                    "kanban-column-scroll relative flex-1 min-h-0 space-y-2 rounded-lg transition-all duration-200 overflow-y-auto px-1",
                    isDraggingOver && draggedIssue && !shouldShowDisabledState && "bg-collab-800/50 border border-blue-500/40 rounded-xl",
                    isDraggingOver && draggedIssue && shouldShowDisabledState && "bg-red-500/5 border border-red-500/40 rounded-xl",
                )}>
                  {isDraggingOver && draggedIssue && shouldShowDisabledState && (
                    <div className="absolute inset-0 bg-red-700/10 z-10">
                      <div className="flex items-center justify-center h-full">
                        <p className="text-white text-sm">{cannotDropReason}</p>
                      </div>
                    </div>
                  )}

                  {/* Create Issue Input */}
                  {isCreatingIssue && (
                    <QuickIssueCreate
                      columnId={column.id}
                      columnStatus={column.name}
                      projects={projects}
                      workspaceId={workspaceId}
                      currentUserId={currentUserId}
                      onCancel={onCancelCreatingIssue}
                      onCreated={onIssueCreated}
                    />
                  )}
                  {/* Issues */}
                  {visibleIssues.map((issue: any, index: number) => (
                    <KanbanIssueCard
                      key={issue.id}
                      issue={issue}
                      index={index}
                      displayProperties={displayProperties}
                      operationsInProgress={operationsInProgress}
                      onCardClick={onIssueClick}
                    />
                  ))}

                  {provided.placeholder}

                  {/* Load More */}
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setVisibleCount(prev => prev + LOAD_MORE_INCREMENT)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 my-1 text-xs text-collab-400 hover:text-collab-200 hover:bg-collab-800/60 rounded-lg transition-colors"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                      <span>Show {Math.min(hiddenCount, LOAD_MORE_INCREMENT)} more ({hiddenCount} remaining)</span>
                    </button>
                  )}

                  {/* Empty Column */}
                  {column.issues.length === 0 && !isCreatingIssue && !isDraggingOver && (
                    <div
                      className="cursor-pointer"
                      onClick={handleStartCreatingIssue}
                    >
                      <div className="py-8 text-center">
                        <div
                          className="w-full h-16 rounded-lg mb-3"
                          style={{
                            backgroundImage: "radial-gradient(circle, #1f1f22 1px, transparent 1px)",
                            backgroundSize: "8px 8px",
                          }}
                        />
                        <p className="text-xs text-collab-500">No issues — click to add</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Droppable>
          </div>
        );
      }}
    </Draggable>
  );
});

export default KanbanColumn;