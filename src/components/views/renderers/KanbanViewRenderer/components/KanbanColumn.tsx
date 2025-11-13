"use client";

import { forwardRef, useCallback, useMemo, type MutableRefObject } from "react";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Plus,
  GripVertical,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Draggable, Droppable } from "@hello-pangea/dnd";
import { getColumnColor } from '../utils';
import KanbanIssueCard from './KanbanIssueCard';
import QuickIssueCreate from './QuickIssueCreate';
import type { KanbanColumnProps } from '../types';

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
                "flex items-center justify-between p-4 border-b-2 mb-4 cursor-grab active:cursor-grabbing",
                getColumnColor(column.name, groupField)
              )}
            >
              <div className="flex items-center gap-3">
                <GripVertical className="h-4 w-4 text-[#666]" />
                <h3 className="font-medium text-white">
                  {column.name}
                </h3>
                <Badge variant="secondary" className="text-xs bg-[#1f1f1f] text-[#999] border-0">
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
                className="h-6 w-6 text-[#666] hover:text-white"
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
                    "relative flex-1 space-y-2 min-h-[200px] rounded-lg transition-all duration-200 overflow-y-auto kanban-column-scroll",
                    isDraggingOver && draggedIssue && !shouldShowDisabledState && "bg-[#1a1a1a] border border-[#0969da]",
                    isDraggingOver && draggedIssue && shouldShowDisabledState && "bg-[#1a1a1a] border border-red-500",
                  )}
                >
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
                  {column.issues.map((issue: any, index: number) => (
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

                  {/* Empty Column */}
                  {column.issues.length === 0 && !isCreatingIssue && !isDraggingOver && (
                    <div
                      className={cn(
                        "flex items-center justify-center h-32 text-[#666] border-2 border-dashed border-[#2a2a2a] rounded-lg transition-colors cursor-pointer",
                        isDraggingOver && draggedIssue && "pointer-events-none",
                        !isDraggingOver && draggedIssue && "hover:border-[#0969da]"
                      )}
                      onClick={handleStartCreatingIssue}
                    >
                      <div className="text-center">
                        <Plus className="h-6 w-6 mx-auto mb-2 text-[#666]" />
                        <p className="text-sm">Add first issue</p>
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