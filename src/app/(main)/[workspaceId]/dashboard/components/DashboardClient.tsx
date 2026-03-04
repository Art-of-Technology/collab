"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useWorkspace } from "@/context/WorkspaceContext";
import SimplifiedDashboard from "@/components/dashboard/SimplifiedDashboard";

// ─── API Response Types ───────────────────────────────────────────────────────

interface QueueItem {
  id: string;
  issueKey: string;
  title: string;
  priority: "urgent" | "high" | "medium" | "low" | null;
  status: string | null;
  statusColor: string | null;
  dueDate: string | null;
  projectId: string;
  projectName: string;
  projectColor: string;
  reason: "overdue" | "due-today" | "mentioned" | "stale" | "high-priority";
  daysOverdue?: number;
  daysSinceUpdate?: number;
}

interface WorkItem {
  id: string;
  issueKey: string;
  title: string;
  status: string | null;
  statusColor: string | null;
  daysInStatus: number;
  projectName: string;
  projectColor: string;
}

interface RecentInteraction {
  id: string;
  type: "issue" | "project" | "view";
  issueKey?: string;
  title: string;
  color: string;
  projectSlug?: string;
  viewSlug?: string;
  action: "created" | "assigned" | "status_changed" | "commented" | "viewed";
  timestamp: string;
}

interface DashboardData {
  greeting: string;
  summary: string;
  myQueue: QueueItem[];
  workInProgress: {
    inProgress: WorkItem[];
    inReview: WorkItem[];
    readyToDeploy: WorkItem[];
  };
  recentInteractions: RecentInteraction[];
}

// ─── Component ────────────────────────────────────────────────────────────────

interface DashboardClientProps {
  workspaceId: string;
  workspaceSlug: string;
  userName: string;
}

export default function DashboardClient({
  workspaceId,
  userName,
}: DashboardClientProps) {
  const { currentWorkspace } = useWorkspace();
  const { data: session } = useSession();

  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const wsId = currentWorkspace?.id || workspaceId;
  const displayName = session?.user?.name || userName || "there";

  const fetchData = useCallback(async () => {
    if (!wsId) return;
    try {
      const res = await fetch(`/api/ai/dashboard?workspaceId=${wsId}`);
      if (res.ok) {
        setDashboardData(await res.json());
      }
    } catch (e) {
      console.error("Failed to fetch dashboard data:", e);
    } finally {
      setLoading(false);
    }
  }, [wsId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !dashboardData) {
    return (
      <div className="h-full w-full overflow-y-auto">
        <div className="flex flex-col gap-8 p-8 max-w-[1400px] mx-auto animate-pulse">
          {/* Header skeleton */}
          <div>
            <div className="h-8 w-48 bg-collab-800 rounded-lg mb-2" />
            <div className="h-4 w-64 bg-collab-800 rounded-lg" />
          </div>

          {/* Stats skeleton */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-collab-800 rounded-2xl border border-collab-700" />
            ))}
          </div>

          {/* Work sections skeleton */}
          <div className="flex gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="w-[320px] h-[280px] bg-collab-800 rounded-2xl border border-collab-700 flex-shrink-0" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <SimplifiedDashboard
      userName={displayName}
      greeting={dashboardData?.greeting || "Welcome back"}
      summary={dashboardData?.summary}
      myQueue={dashboardData?.myQueue || []}
      workInProgress={dashboardData?.workInProgress || { inProgress: [], inReview: [], readyToDeploy: [] }}
      recentInteractions={dashboardData?.recentInteractions || []}
    />
  );
}
