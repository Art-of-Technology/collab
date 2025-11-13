"use client";

import { useCallback, useEffect, useRef } from "react";
import { DragDropContext, Droppable, type DragStart, type DragUpdate, type DropResult } from "@hello-pangea/dnd";
import KanbanColumn from "./KanbanColumn";
import type { KanbanBoardProps, KanbanDropResult, KanbanDragUpdate } from "../types";

const EDGE_SCROLL_THRESHOLD = 120;
const BASE_SCROLL_SPEED = 6;
const EDGE_SCROLL_MAX_SPEED = 28;
// Tolerance for scroll boundary checks to account for floating-point precision and sub-pixel scrolling
const SCROLL_BOUNDARY_TOLERANCE = 1;

type ScrollDirection = -1 | 0 | 1;

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

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const isIssueDragRef = useRef(false);
  const autoScrollState = useRef<{ rafId: number; direction: ScrollDirection; speed: number }>({
    rafId: 0,
    direction: 0,
    speed: 0,
  });
  const pointerOverrideRef = useRef<{ columnId: string; columnIndex: number; issueIndex: number } | null>(null);
  const lastPointerPositionRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const isScrollListenerAttachedRef = useRef(false);

  const updatePointerOverride = useCallback((clientX: number, clientY: number) => {
    const container = scrollContainerRef.current;
    if (!container) {
      pointerOverrideRef.current = null;
      return;
    }

    const columnNodes = Array.from(container.querySelectorAll<HTMLElement>("[data-column-id]"));
    if (!columnNodes.length) {
      pointerOverrideRef.current = null;
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const xWithinContainer = clientX + container.scrollLeft - containerRect.left;

    let bestIndex = 0;
    let bestNode: HTMLElement | null = columnNodes[0];
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let idx = 0; idx < columnNodes.length; idx += 1) {
      const node = columnNodes[idx];
      const rect = node.getBoundingClientRect();
      const left = rect.left + container.scrollLeft - containerRect.left;
      const right = left + rect.width;

      let distance: number;
      let candidateIndex: number;
      let candidateNode: HTMLElement;

      if (xWithinContainer < left) {
        distance = left - xWithinContainer;
        candidateIndex = idx;
        candidateNode = node;
      } else if (xWithinContainer > right) {
        distance = xWithinContainer - right;
        const nextIndex = Math.min(idx + 1, columnNodes.length - 1);
        candidateIndex = nextIndex;
        candidateNode = columnNodes[nextIndex];
      } else {
        distance = 0;
        candidateIndex = idx;
        candidateNode = node;
      }

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = candidateIndex;
        bestNode = candidateNode;
      }

      if (distance === 0) {
        break;
      }
    }

    const targetNode = bestNode ?? columnNodes[Math.min(bestIndex, columnNodes.length - 1)];
    const columnId = targetNode?.dataset.columnId;
    if (!columnId) {
      pointerOverrideRef.current = null;
      return;
    }

    const issueNodes = Array.from(
      targetNode.querySelectorAll<HTMLElement>("[data-issue-id]")
    ).filter((node) => node.offsetParent !== null);

    let issueIndex = issueNodes.length;
    for (let idx = 0; idx < issueNodes.length; idx += 1) {
      const issueRect = issueNodes[idx].getBoundingClientRect();
      const midpoint = issueRect.top + issueRect.height / 2;
      if (clientY < midpoint) {
        issueIndex = idx;
        break;
      }
    }

    const previous = pointerOverrideRef.current;
    if (!previous || previous.columnId !== columnId || previous.issueIndex !== issueIndex) {
      pointerOverrideRef.current = {
        columnId,
        columnIndex: bestIndex,
        issueIndex,
      };
    }
  }, []);

  const handleContainerScroll = useCallback(() => {
    if (!isIssueDragRef.current) return;
    const lastPointer = lastPointerPositionRef.current;
    if (!lastPointer) return;
    updatePointerOverride(lastPointer.clientX, lastPointer.clientY);
  }, [updatePointerOverride]);

  const addContainerScrollListener = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || isScrollListenerAttachedRef.current) return;
    container.addEventListener("scroll", handleContainerScroll, { passive: true });
    isScrollListenerAttachedRef.current = true;
  }, [handleContainerScroll]);

  const removeContainerScrollListener = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !isScrollListenerAttachedRef.current) return;
    container.removeEventListener("scroll", handleContainerScroll);
    isScrollListenerAttachedRef.current = false;
  }, [handleContainerScroll]);

  const runAutoScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      autoScrollState.current.rafId = 0;
      return;
    }

    const { direction, speed } = autoScrollState.current;
    if (!direction) {
      autoScrollState.current.rafId = 0;
      return;
    }

    const scrollDelta = Math.max(BASE_SCROLL_SPEED, speed || BASE_SCROLL_SPEED) * direction;
    const previousScrollLeft = container.scrollLeft;
    container.scrollLeft += scrollDelta;

    if (container.scrollLeft === previousScrollLeft) {
      autoScrollState.current.direction = 0;
      autoScrollState.current.speed = 0;
      autoScrollState.current.rafId = 0;
      return;
    }

    autoScrollState.current.rafId = window.requestAnimationFrame(runAutoScroll);
  }, []);

  const updateAutoScroll = useCallback(
    (direction: ScrollDirection) => {
      const state = autoScrollState.current;

      if (state.direction === direction) {
        if (direction === 0 && state.rafId) {
          window.cancelAnimationFrame(state.rafId);
          state.rafId = 0;
        }
        return;
      }

      state.direction = direction;

      if (direction === 0) {
        state.speed = 0;
        if (state.rafId) {
          window.cancelAnimationFrame(state.rafId);
          state.rafId = 0;
        }
        return;
      }

      if (!state.rafId) {
        state.rafId = window.requestAnimationFrame(runAutoScroll);
      }
    },
    [runAutoScroll]
  );

  const stopAutoScroll = useCallback(() => {
    const state = autoScrollState.current;
    state.speed = 0;
    if (state.direction !== 0) {
      state.direction = 0;
    }
    if (state.rafId) {
      window.cancelAnimationFrame(state.rafId);
      state.rafId = 0;
    }
  }, []);

  const computeEdgeSpeed = useCallback((distanceFromEdge: number) => {
    const clampedDistance = Math.min(Math.max(distanceFromEdge, 0), EDGE_SCROLL_THRESHOLD);
    const proximity = EDGE_SCROLL_THRESHOLD - clampedDistance;
    const normalized = proximity / EDGE_SCROLL_THRESHOLD;
    const speedRange = EDGE_SCROLL_MAX_SPEED - BASE_SCROLL_SPEED;
    const speed = BASE_SCROLL_SPEED + Math.round(normalized * speedRange);
    return Math.max(BASE_SCROLL_SPEED, Math.min(EDGE_SCROLL_MAX_SPEED, speed));
  }, []);

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (!isIssueDragRef.current) return;

      const container = scrollContainerRef.current;
      if (!container) return;

      lastPointerPositionRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
      };

      updatePointerOverride(event.clientX, event.clientY);

      const rect = container.getBoundingClientRect();
      const pointerX = event.clientX;
      const maxScrollLeft = container.scrollWidth - container.clientWidth;

      if (maxScrollLeft <= 0) {
        updateAutoScroll(0);
        return;
      }

      let direction: ScrollDirection = 0;

      if (pointerX >= rect.right - EDGE_SCROLL_THRESHOLD) {
        if (container.scrollLeft < maxScrollLeft - SCROLL_BOUNDARY_TOLERANCE) {
          direction = 1;
          const distanceFromEdge = Math.max(0, rect.right - pointerX);
          autoScrollState.current.speed = computeEdgeSpeed(distanceFromEdge);
        }
      } else if (pointerX <= rect.left + EDGE_SCROLL_THRESHOLD) {
        if (container.scrollLeft > 0) {
          direction = -1;
          const distanceFromEdge = Math.max(0, pointerX - rect.left);
          autoScrollState.current.speed = computeEdgeSpeed(distanceFromEdge);
        }
      } else {
        autoScrollState.current.speed = 0;
      }

      if (direction === 0) {
        autoScrollState.current.speed = 0;
      }

      updateAutoScroll(direction);
    },
    [computeEdgeSpeed, updatePointerOverride, updateAutoScroll]
  );

  const handlePointerEnd = useCallback(() => {
    if (!isIssueDragRef.current) return;
    isIssueDragRef.current = false;
    stopAutoScroll();
    lastPointerPositionRef.current = null;
    removeContainerScrollListener();
  }, [removeContainerScrollListener, stopAutoScroll]);

  const removePointerListeners = useCallback(() => {
    window.removeEventListener("pointermove", handlePointerMove, { passive: true });
    window.removeEventListener("pointerup", handlePointerEnd, { passive: true });
    window.removeEventListener("pointercancel", handlePointerEnd, { passive: true });
  }, [handlePointerEnd, handlePointerMove]);

  const addPointerListeners = useCallback(() => {
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerup", handlePointerEnd, { passive: true });
    window.addEventListener("pointercancel", handlePointerEnd, { passive: true });
  }, [handlePointerEnd, handlePointerMove]);

  const handleDragStartInternal = useCallback(
    (start: DragStart) => {
      stopAutoScroll();

      pointerOverrideRef.current = null;
      lastPointerPositionRef.current = null;

      if (start.type === "issue") {
        isIssueDragRef.current = true;
        addPointerListeners();
        addContainerScrollListener();
      } else {
        isIssueDragRef.current = false;
      }

      onDragStart(start);
    },
    [addContainerScrollListener, addPointerListeners, onDragStart, stopAutoScroll]
  );

  const handleDragUpdateInternal = useCallback(
    (update: DragUpdate) => {
      if (update.type === "issue") {
        const override = pointerOverrideRef.current;
        if (override) {
          const extendedUpdate: KanbanDragUpdate = {
            ...update,
            overrideDestination: {
              droppableId: override.columnId,
              index: Math.max(0, override.issueIndex),
            },
          };
          onDragUpdate(extendedUpdate);
          return;
        }
      }

      onDragUpdate(update as KanbanDragUpdate);
    },
    [onDragUpdate]
  );

  const handleDragEndInternal = useCallback(
    (result: DropResult) => {
      const override = pointerOverrideRef.current;

      let payload: KanbanDropResult | DropResult = result;

      // Only inject override when drag was actually completed (not cancelled)
      // Check both reason === 'DROP' and destination !== null to be safe
      const isDragCompleted = result.reason === 'DROP' || result.destination !== null;

      if (result.type === "issue" && override && isDragCompleted) {
        const index = Math.max(0, override.issueIndex);
        const overrideDestination = {
          droppableId: override.columnId,
          index,
        };

        payload = {
          ...result,
          destination: {
            ...(result.destination ?? { droppableId: override.columnId, index }),
            droppableId: override.columnId,
            index,
          },
          overrideDestination,
        } as KanbanDropResult;
      }

      onDragEnd(payload as KanbanDropResult);
      handlePointerEnd();
      removePointerListeners();
      pointerOverrideRef.current = null;
    },
    [handlePointerEnd, onDragEnd, removePointerListeners]
  );

  useEffect(() => {
    return () => {
      removePointerListeners();
      handlePointerEnd();
      removeContainerScrollListener();
      pointerOverrideRef.current = null;
      lastPointerPositionRef.current = null;
    };
  }, [handlePointerEnd, removeContainerScrollListener, removePointerListeners]);

  return (
    <DragDropContext
      onDragEnd={handleDragEndInternal}
      onDragStart={handleDragStartInternal}
      onDragUpdate={handleDragUpdateInternal}
    >
      <Droppable droppableId="board" direction="horizontal" type="column">
        {(provided) => (
          <div
            className="flex gap-6 h-full min-w-0 overflow-x-auto kanban-horizontal-scroll"
            ref={(node) => {
              scrollContainerRef.current = node;
              provided.innerRef(node);
            }}
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
