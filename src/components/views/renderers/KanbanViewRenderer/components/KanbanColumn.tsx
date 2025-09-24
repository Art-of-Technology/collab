"use client";

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

export default function KanbanColumn({
  column,
  index,
  groupField,
  displayProperties,
  isCreatingIssue,
  projects,
  workspaceId,
  currentUserId,
  draggedIssue,
  hoverState,
  onIssueClick,
  onStartCreatingIssue,
  onCancelCreatingIssue,
  onIssueCreated
}: KanbanColumnProps) {

  const shouldShowDisabledState = hoverState.columnId === column.id && !hoverState.canDrop;
  const cannotDropReason = `Cannot drop issue from ${draggedIssue?.project?.name || 'different project'} here`;

  return (
    <Draggable key={column.id} draggableId={column.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
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
              onClick={() => onStartCreatingIssue(column.id)}
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
                  "relative flex-1 space-y-2 min-h-[200px] rounded-lg transition-all duration-200 overflow-y-auto",
                  snapshot.isDraggingOver && !shouldShowDisabledState && "bg-[#1a1a1a] border border-[#0969da]",
                  snapshot.isDraggingOver && shouldShowDisabledState && "bg-[#1a1a1a] border border-red-500",
                )}
              >
                {snapshot.isDraggingOver && shouldShowDisabledState && (
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
                    onCardClick={onIssueClick}
                  />
                ))}

                {provided.placeholder}

                {/* Empty Column */}
                {column.issues.length === 0 && !isCreatingIssue && !snapshot.isDraggingOver && (
                  <div
                    className={cn(
                      "flex items-center justify-center h-32 text-[#666] border-2 border-dashed border-[#2a2a2a] rounded-lg transition-colors cursor-pointer",
                      snapshot.isDraggingOver && "pointer-events-none",
                      !snapshot.isDraggingOver && "hover:border-[#0969da]"
                    )}
                    onClick={() => onStartCreatingIssue(column.id)}
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
      )}
    </Draggable>
  );
}