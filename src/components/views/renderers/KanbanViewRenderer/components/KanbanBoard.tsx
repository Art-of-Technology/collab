"use client";

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
  projects,
  workspaceId,
  currentUserId,
  draggedIssue,
  hoverState,
  operationsInProgress,
  onDragEnd,
  onDragStart,
  onDragUpdate,
  onIssueClick,
  onCreateIssue,
  onStartCreatingIssue,
  onCancelCreatingIssue,
  onIssueKeyDown,
  onIssueInputChange,
  onIssueCreated,
}: KanbanBoardProps) {

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
                issues={issues}
                index={index}
                groupField={groupField}
                displayProperties={displayProperties}
                isCreatingIssue={isCreatingIssue === column.id}
                newIssueTitle={newIssueTitle}
                projects={projects}
                workspaceId={workspaceId}
                currentUserId={currentUserId}
                draggedIssue={draggedIssue}
                hoverState={hoverState}
                operationsInProgress={operationsInProgress}
                onIssueClick={onIssueClick}
                onCreateIssue={onCreateIssue}
                onStartCreatingIssue={onStartCreatingIssue}
                onCancelCreatingIssue={onCancelCreatingIssue}
                onIssueKeyDown={onIssueKeyDown}
                onIssueInputChange={onIssueInputChange}
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
