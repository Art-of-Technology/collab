"use client";

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { issueKeys } from '@/hooks/queries/useIssues';
import { boardItemsKeys } from '@/hooks/queries/useBoardItems';

export interface RealtimeOptions {
  workspaceId?: string;
  boardId?: string;
  viewId?: string;
}

// Singleton connection manager per workspace to avoid duplicate SSE connections
type WorkspaceConnection = {
  source: EventSource;
  refCount: number;
  listeners: Set<(data: any) => void>;
};

const workspaceConnections: Record<string, WorkspaceConnection> = {};

function getOrCreateWorkspaceConnection(workspaceId: string): WorkspaceConnection {
  let conn = workspaceConnections[workspaceId];
  if (conn) return conn;

  const url = `/api/realtime/workspace/${workspaceId}/stream`;
  const source = new EventSource(url, { withCredentials: true });
  conn = {
    source,
    refCount: 0,
    listeners: new Set(),
  };

  source.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      conn.listeners.forEach((cb) => cb(data));
    } catch {
      // ignore
    }
  };

  source.onerror = () => {
    // Allow the browser to manage reconnection
  };

  workspaceConnections[workspaceId] = conn;
  return conn;
}

export function useRealtimeWorkspaceEvents(options: RealtimeOptions) {
  const { workspaceId, boardId, viewId } = options;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!workspaceId) return;

    const conn = getOrCreateWorkspaceConnection(workspaceId);
    conn.refCount += 1;

    const handleEvent = (data: any) => {
      try {
        if (data?.type === 'issue.updated') {
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

    conn.listeners.add(handleEvent);

    return () => {
      conn.listeners.delete(handleEvent);
      conn.refCount -= 1;
      if (conn.refCount <= 0) {
        try { conn.source.close(); } catch {}
        delete workspaceConnections[workspaceId];
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, boardId, viewId]);
}



