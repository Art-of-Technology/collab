"use client";

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { issueKeys } from '@/hooks/queries/useIssues';
import { boardItemsKeys } from '@/hooks/queries/useBoardItems';

export interface RealtimeOptions {
  workspaceId?: string;
  boardId?: string;
  viewId?: string;
}

export function useRealtimeWorkspaceEvents(options: RealtimeOptions) {
  const { workspaceId, boardId, viewId } = options;
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!workspaceId) return;

    const url = `/api/realtime/workspace/${workspaceId}/stream`;
    const es = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data?.type === 'issue.updated') {
          // Invalidate issues for this workspace
          if (data.workspaceId) {
            queryClient.invalidateQueries({ queryKey: issueKeys.byWorkspace(String(data.workspaceId)) });
          }
          // Invalidate board items if we have board context
          if (boardId) {
            queryClient.invalidateQueries({ queryKey: boardItemsKeys.board(boardId) });
          }
          // Also invalidate specific issue detail cache
          if (data.issueId) {
            queryClient.invalidateQueries({ queryKey: issueKeys.detail(String(data.issueId)) });
          }
        }

        if (data?.type === 'issue.created') {
          if (data.workspaceId) {
            queryClient.invalidateQueries({ queryKey: issueKeys.byWorkspace(String(data.workspaceId)) });
          }
          if (boardId) {
            queryClient.invalidateQueries({ queryKey: boardItemsKeys.board(boardId) });
          }
          if (data.issueId) {
            queryClient.invalidateQueries({ queryKey: issueKeys.detail(String(data.issueId)) });
          }
        }

        if (data?.type === 'view.issue-position.updated') {
          if (data.viewId && (!viewId || data.viewId === viewId)) {
            queryClient.invalidateQueries({ queryKey: ['viewPositions', data.viewId] });
          }
        }

        if (data?.type === 'board.items.reordered') {
          if (boardId && data.boardId === boardId) {
            queryClient.invalidateQueries({ queryKey: boardItemsKeys.board(boardId) });
          }
        }

        if (data?.type === 'board.updated') {
          if (boardId && data.boardId === boardId) {
            queryClient.invalidateQueries({ queryKey: boardItemsKeys.board(boardId) });
          }
        }
      } catch {
        // ignore invalid messages
      }
    };

    es.onerror = () => {
      // Let browser retry with default EventSource behavior
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, boardId, viewId]);
}



