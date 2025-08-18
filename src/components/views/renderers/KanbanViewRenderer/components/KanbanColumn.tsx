"use client";

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Plus,
  GripVertical,
  Check,
  X
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
  newIssueTitle,
  editingColumnId,
  newColumnName,
  projects,
  workspaceId,
  currentUserId,
  onIssueClick,
  onCreateIssue,
  onStartCreatingIssue,
  onCancelCreatingIssue,
  onIssueKeyDown,
  onIssueInputChange,
  onStartEditingColumn,
  onColumnEdit,
  onCancelEditingColumn,
  onColumnKeyDown,
  onColumnNameChange,
  onIssueCreated
}: KanbanColumnProps) {
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
              {editingColumnId === column.id ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={newColumnName}
                    onChange={(e) => onColumnNameChange(e.target.value)}
                    onKeyDown={onColumnKeyDown}
                    className="h-8 text-sm"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onColumnEdit(column.id, newColumnName)}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={onCancelEditingColumn}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <GripVertical className="h-4 w-4 text-[#666]" />
                  <h3
                    className="font-medium text-white cursor-pointer hover:text-[#0969da]"
                    onDoubleClick={() => onStartEditingColumn(column.id, column.name)}
                  >
                    {column.name}
                  </h3>
                  <Badge variant="secondary" className="text-xs bg-[#1f1f1f] text-[#999] border-0">
                    {column.issues.length}
                  </Badge>
                </>
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
                  "flex-1 space-y-2 min-h-[200px] rounded-lg transition-colors",
                  snapshot.isDraggingOver && "bg-[#1a1a1a]"
                )}
              >
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
                {column.issues.length === 0 && !isCreatingIssue && (
                  <div
                    className="flex items-center justify-center h-32 text-[#666] border-2 border-dashed border-[#2a2a2a] rounded-lg hover:border-[#0969da] transition-colors cursor-pointer"
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