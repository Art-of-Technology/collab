"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import { DragDropContext, Droppable, type DragStart, type DragUpdate, type DropResult } from "@hello-pangea/dnd";
import KanbanColumn from "./KanbanColumn";
import { KanbanMinimap } from "./KanbanMinimap";
import type { KanbanBoardProps, KanbanDropResult, KanbanDragUpdate } from "../types";

const EDGE_SCROLL_THRESHOLD = 256;
// px/sec speeds for refresh-rate independence
const BASE_SCROLL_SPEED_PX_PER_SEC = 160;
const EDGE_SCROLL_MAX_SPEED_PX_PER_SEC = 16;
// Tolerance for scroll boundary checks to account for floating-point precision and sub-pixel scrolling
const SCROLL_BOUNDARY_TOLERANCE = 1;

type ScrollDirection = -1 | 0 | 1;

function KanbanBoard({
  columns,
  displayProperties,
  groupField,
  isCreatingIssue,
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
  onStartCreatingIssue,
  onCancelCreatingIssue,
  onIssueCreated,
}: KanbanBoardProps) {

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const columnsRef = useRef(columns);
  const isIssueDragRef = useRef(false);
  const autoScrollState = useRef<{ rafId: number; direction: ScrollDirection; speedPxPerSec: number; lastTs: number | null }>({
    rafId: 0,
    direction: 0,
    speedPxPerSec: 0,
    lastTs: null,
  });
  const pointerOverrideRef = useRef<{ columnId: string; columnIndex: number; issueIndex: number } | null>(null);
  const lastOverrideSigRef = useRef<{ columnId: string; issueIndex: number } | null>(null);
  const lastPointerPositionRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const isScrollListenerAttachedRef = useRef(false);
  const dragWorkRafRef = useRef<number>(0);
  const runDragWorkRef = useRef<() => void>(() => { });
  const dragMonitorRafRef = useRef<number>(0);
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const columnHoverPositionRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    columnsRef.current = columns;
  }, [columns]);

  const updatePointerOverride = useCallback((clientX: number, clientY: number) => {
    const container = scrollContainerRef.current;
    if (!container) {
      pointerOverrideRef.current = null;
      return;
    }

    const columnNodes = columnsRef.current
      .map((c) => columnRefs.current[c.id])
      .filter((n): n is HTMLDivElement => Boolean(n));

    if (!columnNodes.length) {
      pointerOverrideRef.current = null;
      return;
    }

    const x = clientX;

    let targetIndex = 0;
    let targetNode: HTMLElement = columnNodes[0];
    for (let i = 0; i < columnNodes.length; i += 1) {
      const r = columnNodes[i].getBoundingClientRect();
      const left = r.x;
      const right = left + r.width;
      if (x < left) { targetIndex = i; targetNode = columnNodes[i]; break; }
      if (x <= right) { targetIndex = i; targetNode = columnNodes[i]; break; }
      if (i === columnNodes.length - 1) { targetIndex = i; targetNode = columnNodes[i]; }
    }

    columnHoverPositionRef.current = targetNode.dataset.columnId;

    const columnId = targetNode.dataset.columnId;
    if (!columnId) {
      pointerOverrideRef.current = null;
      return;
    }

    const scrollArea = targetNode.querySelector<HTMLElement>(".kanban-column-scroll") || targetNode;
    const issues = Array.from(targetNode.querySelectorAll<HTMLElement>("[data-issue-id]")).filter((n) => n.offsetParent !== null);
    const scrollRect = scrollArea.getBoundingClientRect();
    const y = clientY - scrollRect.top + scrollArea.scrollTop;

    let issueIndex = issues.length;
    for (let i = 0; i < issues.length; i += 1) {
      const mid = issues[i].offsetTop + (issues[i].offsetHeight / 2);
      if (y < mid) { issueIndex = i; break; }
    }

    const prev = pointerOverrideRef.current;
    if (!prev || prev.columnId !== columnId || prev.issueIndex !== issueIndex) {
      pointerOverrideRef.current = { columnId, columnIndex: targetIndex, issueIndex };
    }
  }, []);

  const handleContainerScroll = useCallback(() => {
    if (!isIssueDragRef.current) return;
    const lastPointer = lastPointerPositionRef.current;
    if (!lastPointer) return;
    // Schedule per-frame work rather than compute immediately
    if (!dragWorkRafRef.current) {
      dragWorkRafRef.current = window.requestAnimationFrame(() => {
        dragWorkRafRef.current = 0;
        runDragWorkRef.current();
      });
    }
  }, []);

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

  const runAutoScroll = useCallback((timestamp?: number) => {
    const container = scrollContainerRef.current;
    if (!container) {
      autoScrollState.current.rafId = 0;
      return;
    }

    const { direction, speedPxPerSec, lastTs } = autoScrollState.current;
    if (!direction) {
      autoScrollState.current.rafId = 0;
      autoScrollState.current.lastTs = null;
      return;
    }

    const now = timestamp ?? performance.now();
    const prev = lastTs ?? now;
    const deltaMs = Math.max(0, now - prev);
    autoScrollState.current.lastTs = now;

    const pxPerSec = Math.max(BASE_SCROLL_SPEED_PX_PER_SEC, speedPxPerSec || BASE_SCROLL_SPEED_PX_PER_SEC);
    const scrollDelta = Math.max(EDGE_SCROLL_MAX_SPEED_PX_PER_SEC, pxPerSec * (deltaMs / 1000)) * direction;
    const previousScrollLeft = container.scrollLeft;
    container.scrollLeft = previousScrollLeft + scrollDelta;

    if (container.scrollLeft === previousScrollLeft) {
      autoScrollState.current.direction = 0;
      autoScrollState.current.speedPxPerSec = 0;
      autoScrollState.current.rafId = 0;
      autoScrollState.current.lastTs = null;
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
          state.lastTs = null;
        }
        return;
      }

      state.direction = direction;

      if (direction === 0) {
        state.speedPxPerSec = 0;
        state.lastTs = null;
        if (state.rafId) {
          window.cancelAnimationFrame(state.rafId);
          state.rafId = 0;
        }
        return;
      }

      if (!state.rafId) {
        state.rafId = window.requestAnimationFrame(runAutoScroll);
        state.lastTs = null;
      }
    },
    [runAutoScroll]
  );

  const stopAutoScroll = useCallback(() => {
    const state = autoScrollState.current;
    state.speedPxPerSec = 0;
    state.lastTs = null;
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
    const speedRange = EDGE_SCROLL_MAX_SPEED_PX_PER_SEC - BASE_SCROLL_SPEED_PX_PER_SEC;
    const speed = BASE_SCROLL_SPEED_PX_PER_SEC + Math.round(normalized * speedRange);
    return Math.max(BASE_SCROLL_SPEED_PX_PER_SEC, Math.min(EDGE_SCROLL_MAX_SPEED_PX_PER_SEC, speed));
  }, []);

  const processPointerState = useCallback((notifyOverride: boolean) => {
    if (!isIssueDragRef.current) {
      return false;
    }
    const container = scrollContainerRef.current;
    const lastPointer = lastPointerPositionRef.current;
    if (!container || !lastPointer) {
      updateAutoScroll(0);
      return false;
    }

    // Recompute pointer override using latest pointer position
    updatePointerOverride(lastPointer.clientX, lastPointer.clientY);

    const rect = container.getBoundingClientRect();
    const pointerX = lastPointer.clientX;
    const maxScrollLeft = container.scrollWidth - container.clientWidth;

    if (maxScrollLeft <= 0) {
      updateAutoScroll(0);
      return false;
    }

    let direction: ScrollDirection = 0;

    if (pointerX >= rect.right - EDGE_SCROLL_THRESHOLD) {
      if (container.scrollLeft < maxScrollLeft - SCROLL_BOUNDARY_TOLERANCE) {
        direction = 1;
        const distanceFromEdge = Math.max(0, rect.right - pointerX);
        autoScrollState.current.speedPxPerSec = computeEdgeSpeed(distanceFromEdge);
      }
    } else if (pointerX <= rect.left + EDGE_SCROLL_THRESHOLD) {
      if (container.scrollLeft > 0) {
        direction = -1;
        const distanceFromEdge = Math.max(0, pointerX - rect.left);
        autoScrollState.current.speedPxPerSec = computeEdgeSpeed(distanceFromEdge);
      }
    } else {
      autoScrollState.current.speedPxPerSec = 0;
    }

    if (direction === 0) {
      autoScrollState.current.speedPxPerSec = 0;
    }

    updateAutoScroll(direction);
    if (notifyOverride) {
      const override = pointerOverrideRef.current;
      if (override) {
        const sig = { columnId: override.columnId, issueIndex: Math.max(0, override.issueIndex) };
        const lastSig = lastOverrideSigRef.current;
        if (!lastSig || lastSig.columnId !== sig.columnId || lastSig.issueIndex !== sig.issueIndex) {
          lastOverrideSigRef.current = sig;
          const extendedUpdate: KanbanDragUpdate = {
            type: "issue",
            overrideColumnId: sig.columnId,
          } as KanbanDragUpdate;
          onDragUpdate(extendedUpdate);
        }
      }
    }

    return true;
  }, [computeEdgeSpeed, onDragUpdate, updateAutoScroll, updatePointerOverride]);

  const runDragWork = useCallback(() => {
    dragWorkRafRef.current = 0;
    processPointerState(false);
  }, [processPointerState]);

  const dragMonitorLoop = useCallback(() => {
    if (!processPointerState(true)) {
      dragMonitorRafRef.current = 0;
      return;
    }
    dragMonitorRafRef.current = window.requestAnimationFrame(dragMonitorLoop);
  }, [processPointerState]);

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (!isIssueDragRef.current) return;
      lastPointerPositionRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
      };
      if (!dragWorkRafRef.current) {
        dragWorkRafRef.current = window.requestAnimationFrame(() => runDragWorkRef.current());
      }
    },
    []
  );

  const handlePointerEnd = useCallback(() => {
    if (!isIssueDragRef.current) return;
    isIssueDragRef.current = false;
    stopAutoScroll();
    lastPointerPositionRef.current = null;
    removeContainerScrollListener();
    if (dragWorkRafRef.current) {
      window.cancelAnimationFrame(dragWorkRafRef.current);
      dragWorkRafRef.current = 0;
    }
    if (dragMonitorRafRef.current) {
      window.cancelAnimationFrame(dragMonitorRafRef.current);
      dragMonitorRafRef.current = 0;
    }
  }, [removeContainerScrollListener, stopAutoScroll]);

  const removePointerListeners = useCallback(() => {
    window.removeEventListener("pointermove", handlePointerMove as EventListener);
    window.removeEventListener("mousemove", handlePointerMove as EventListener, true as any);
    window.removeEventListener("pointerup", handlePointerEnd as EventListener);
    window.removeEventListener("pointercancel", handlePointerEnd as EventListener);
  }, [handlePointerEnd, handlePointerMove]);

  const addPointerListeners = useCallback(() => {
    // Use pointer and mouse move (capture) to ensure we get updates under different sensors
    window.addEventListener("pointermove", handlePointerMove, { passive: true, capture: true });
    window.addEventListener("mousemove", handlePointerMove as EventListener, { passive: true, capture: true } as any);
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
        if (!dragMonitorRafRef.current) {
          dragMonitorRafRef.current = window.requestAnimationFrame(dragMonitorLoop);
        }
      } else {
        isIssueDragRef.current = false;
      }

      onDragStart(start);
    },
    [addContainerScrollListener, addPointerListeners, dragMonitorLoop, onDragStart, stopAutoScroll]
  );

  const handleDragUpdateInternal = useCallback(
    (update: DragUpdate) => {
      if (update.type === "issue") {
        const overrideColumnId = columnHoverPositionRef.current;
        if (overrideColumnId) {
          const extendedUpdate: KanbanDragUpdate = {
            ...update,
            overrideColumnId: overrideColumnId,
          } as KanbanDragUpdate;
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
    runDragWorkRef.current = runDragWork;
  }, [runDragWork]);

  useEffect(() => {
    return () => {
      removePointerListeners();
      handlePointerEnd();
      removeContainerScrollListener();
      pointerOverrideRef.current = null;
      lastPointerPositionRef.current = null;
      if (dragWorkRafRef.current) {
        window.cancelAnimationFrame(dragWorkRafRef.current);
        dragWorkRafRef.current = 0;
      }
      if (dragMonitorRafRef.current) {
        window.cancelAnimationFrame(dragMonitorRafRef.current);
        dragMonitorRafRef.current = 0;
      }
    };
  }, [handlePointerEnd, removeContainerScrollListener, removePointerListeners]);

  return (
    <>
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
                  ref={(el) => { columnRefs.current[column.id] = el; }}
                  column={column}
                  index={index}
                  groupField={groupField}
                  displayProperties={displayProperties}
                  isCreatingIssue={isCreatingIssue === column.id}
                  projects={projects}
                  workspaceId={workspaceId}
                  currentUserId={currentUserId}
                  draggedIssue={draggedIssue}
                  hoverState={hoverState}
                  operationsInProgress={operationsInProgress}
                  onIssueClick={onIssueClick}
                  onStartCreatingIssue={onStartCreatingIssue}
                  onCancelCreatingIssue={onCancelCreatingIssue}
                  onIssueCreated={onIssueCreated}
                  hoverColumnId={columnHoverPositionRef.current}
                />
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
      
      {/* Minimap for horizontal scroll navigation */}
      <KanbanMinimap 
        scrollContainerRef={scrollContainerRef}
        columns={columns}
      />
    </>
  );
}


export default memo(KanbanBoard);