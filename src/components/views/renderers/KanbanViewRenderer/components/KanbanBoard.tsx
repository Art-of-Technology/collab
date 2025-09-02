"use client";

import { Plus } from "lucide-react";
import { DragDropContext, Droppable } from "@hello-pangea/dnd";
import KanbanColumn from "./KanbanColumn";
import type { KanbanBoardProps } from "../types";

export default function KanbanBoard({
  columns,
  issues,
  displayProperties,
  groupField,
  isCreatingIssue,
  newIssueTitle,
  editingColumnId,
  newColumnName,
  projects,
  workspaceId,
  currentUserId,
  draggedIssue,
  hoverState,
  onDragEnd,
  onDragStart,
  onDragUpdate,
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
  onIssueCreated,
}: KanbanBoardProps) {
  if (issues.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-[#999]">
        <div className="text-center">
          <Plus className="h-12 w-12 mx-auto mb-4 text-[#666]" />
          <p className="text-base">No issues found in this board</p>
          <p className="text-sm text-[#666] mt-1">Create a new issue or adjust your filters</p>
        </div>
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={onDragEnd} onDragStart={onDragStart} onDragUpdate={onDragUpdate}>
      <Droppable droppableId="board" direction="horizontal" type="column">
        {(provided) => (
          <div
            className="flex gap-6 h-full min-w-0 overflow-x-auto kanban-horizontal-scroll"
            ref={provided.innerRef}
            {...provided.droppableProps}
          >
            {columns.map((column, index) => (
              <KanbanColumn
                key={column.id}
                column={column}
                index={index}
                groupField={groupField}
                displayProperties={displayProperties}
                isCreatingIssue={isCreatingIssue === column.id}
                newIssueTitle={newIssueTitle}
                editingColumnId={editingColumnId}
                newColumnName={newColumnName}
                projects={projects}
                workspaceId={workspaceId}
                currentUserId={currentUserId}
                draggedIssue={draggedIssue}
                hoverState={hoverState}
                onIssueClick={onIssueClick}
                onCreateIssue={onCreateIssue}
                onStartCreatingIssue={onStartCreatingIssue}
                onCancelCreatingIssue={onCancelCreatingIssue}
                onIssueKeyDown={onIssueKeyDown}
                onIssueInputChange={onIssueInputChange}
                onStartEditingColumn={onStartEditingColumn}
                onColumnEdit={onColumnEdit}
                onCancelEditingColumn={onCancelEditingColumn}
                onColumnKeyDown={onColumnKeyDown}
                onColumnNameChange={onColumnNameChange}
                onIssueCreated={onIssueCreated}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
