"use client";

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

export function subscribeWorkspaceEvents(workspaceId: string, listener: (data: any) => void) {
  // Live delivery is an enhancement; HTTP reads/polling must still work when
  // EventSource is unsupported or constructing the stream fails.
  if (typeof EventSource === 'undefined') return () => {};
  let conn: WorkspaceConnection;
  try {
    conn = getOrCreateWorkspaceConnection(workspaceId);
  } catch {
    return () => {};
  }
  conn.refCount += 1;
  conn.listeners.add(listener);
  return () => {
    conn.listeners.delete(listener);
    conn.refCount -= 1;
    if (conn.refCount <= 0) {
      conn.source.close();
      delete workspaceConnections[workspaceId];
    }
  };
}
