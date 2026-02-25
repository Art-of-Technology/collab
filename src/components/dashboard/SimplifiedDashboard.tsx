"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  ChevronLeft,
  Clock,
  AlertTriangle,
  Flame,
  Play,
  GitPullRequest,
  Rocket,
  FolderKanban,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/context/WorkspaceContext";
import { PageLayout } from "@/components/ui/page-layout";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  action: "created" | "assigned" | "status_changed" | "commented" | "viewed";
  timestamp: string;
}

interface SimplifiedDashboardProps {
  userName: string;
  greeting: string;
  summary?: string;
  myQueue: QueueItem[];
  workInProgress: {
    inProgress: WorkItem[];
    inReview: WorkItem[];
    readyToDeploy: WorkItem[];
  };
  recentInteractions: RecentInteraction[];
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SimplifiedDashboard({
  userName,
  greeting,
  summary,
  myQueue,
  workInProgress,
  recentInteractions,
}: SimplifiedDashboardProps) {
  const { currentWorkspace } = useWorkspace();
  const base = currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}` : "";
  const firstName = userName?.split(" ")[0] || "there";

  const quickAccessItems = recentInteractions.filter(
    (item) => item.type === "view" || item.type === "project"
  );

  const [expandedSections, setExpandedSections] = useState({
    attention: true,
    inProgress: true,
    inReview: true,
    deploy: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const overdueCount = myQueue.filter((i) => i.reason === "overdue").length;
  const dueTodayCount = myQueue.filter((i) => i.reason === "due-today").length;

  return (
    <PageLayout className="gap-8">
      <PageHeader
        title={`${greeting}, ${firstName}`}
        subtitle={summary || "Here's your workspace overview"}
      />

      {/* ─── Stats Row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Overdue"
          value={overdueCount}
          variant={overdueCount > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Due Today"
          value={dueTodayCount}
          variant={dueTodayCount > 0 ? "info" : "default"}
        />
        <StatCard
          label="In Progress"
          value={workInProgress.inProgress.length}
        />
        <StatCard
          label="In Review"
          value={workInProgress.inReview.length}
        />
      </div>

      {/* ─── Quick Access (Views & Projects only) ───────────────────────── */}
      {quickAccessItems.length > 0 && (
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-collab-500 mb-3">
            Quick Access
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {quickAccessItems.slice(0, 6).map((item) => (
              <Link
                key={`${item.type}-${item.id}`}
                href={
                  item.type === "project"
                    ? `${base}/projects/${item.projectSlug}`
                    : `${base}/views/${item.id}`
                }
                className="group flex items-center gap-3 p-3 rounded-xl bg-collab-800 border border-collab-700 hover:bg-collab-700 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-collab-900 flex items-center justify-center flex-shrink-0">
                  {item.type === "project" ? (
                    <FolderKanban className="w-4 h-4 text-collab-500" />
                  ) : (
                    <LayoutGrid className="w-4 h-4 text-collab-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-collab-400 group-hover:text-white truncate transition-colors">
                    {item.title}
                  </p>
                  <p className="text-xs text-collab-500 capitalize">{item.type}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ─── Work Sections (Horizontal Collapsible) ─────────────────────── */}
      <div>
        <div className="text-xs font-medium uppercase tracking-wider text-collab-500 mb-3">
          Your Work
        </div>
        <div className="flex gap-3 overflow-x-auto pb-4">
          <WorkSection
            title="Needs Attention"
            icon={<AlertTriangle className="w-4 h-4" />}
            count={myQueue.length}
            expanded={expandedSections.attention}
            onToggle={() => toggleSection("attention")}
            variant="warning"
          >
            {myQueue.slice(0, 5).map((item) => (
              <IssueRow key={item.id} item={item} base={base} />
            ))}
            {myQueue.length === 0 && <DashboardEmptyState text="All clear" />}
          </WorkSection>

          <WorkSection
            title="In Progress"
            icon={<Play className="w-4 h-4" />}
            count={workInProgress.inProgress.length}
            expanded={expandedSections.inProgress}
            onToggle={() => toggleSection("inProgress")}
            variant="blue"
          >
            {workInProgress.inProgress.slice(0, 5).map((item) => (
              <WorkRow key={item.id} item={item} base={base} />
            ))}
            {workInProgress.inProgress.length === 0 && <DashboardEmptyState text="No items" />}
          </WorkSection>

          <WorkSection
            title="In Review"
            icon={<GitPullRequest className="w-4 h-4" />}
            count={workInProgress.inReview.length}
            expanded={expandedSections.inReview}
            onToggle={() => toggleSection("inReview")}
            variant="purple"
          >
            {workInProgress.inReview.slice(0, 5).map((item) => (
              <WorkRow key={item.id} item={item} base={base} />
            ))}
            {workInProgress.inReview.length === 0 && <DashboardEmptyState text="No items" />}
          </WorkSection>

          <WorkSection
            title="Ready to Deploy"
            icon={<Rocket className="w-4 h-4" />}
            count={workInProgress.readyToDeploy.length}
            expanded={expandedSections.deploy}
            onToggle={() => toggleSection("deploy")}
            variant="green"
          >
            {workInProgress.readyToDeploy.slice(0, 5).map((item) => (
              <WorkRow key={item.id} item={item} base={base} />
            ))}
            {workInProgress.readyToDeploy.length === 0 && <DashboardEmptyState text="No items" />}
          </WorkSection>
        </div>
      </div>
    </PageLayout>
  );
}

// ─── Work Section ─────────────────────────────────────────────────────────────

interface WorkSectionProps {
  title: string;
  icon: React.ReactNode;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  variant: "warning" | "blue" | "purple" | "green";
  children: React.ReactNode;
}

const variantColors = {
  warning: { dot: "#f59e0b", bg: "rgba(245, 158, 11, 0.1)" },
  blue: { dot: "#3b82f6", bg: "rgba(59, 130, 246, 0.1)" },
  purple: { dot: "#8b5cf6", bg: "rgba(139, 92, 246, 0.1)" },
  green: { dot: "#22c55e", bg: "rgba(34, 197, 94, 0.1)" },
};

function WorkSection({
  title,
  icon,
  count,
  expanded,
  onToggle,
  variant,
  children,
}: WorkSectionProps) {
  const variantColor = variantColors[variant];

  return (
    <div
      className={cn(
        "rounded-2xl bg-collab-800 border border-collab-700 transition-all duration-200 flex-shrink-0",
        expanded ? "w-[320px]" : "w-[56px]"
      )}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 hover:bg-collab-700 transition-colors rounded-t-2xl"
      >
        {expanded ? (
          <ChevronLeft className="w-4 h-4 text-collab-500 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-collab-500 flex-shrink-0" />
        )}

        {expanded && (
          <>
            <div className="text-collab-500 flex-shrink-0">{icon}</div>
            <span className="text-sm font-medium text-collab-400 flex-1 text-left truncate">
              {title}
            </span>
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-lg"
              style={{ backgroundColor: variantColor.bg, color: variantColor.dot }}
            >
              {count}
            </span>
          </>
        )}

        {!expanded && (
          <div className="flex flex-col items-center gap-1.5">
            <div style={{ color: variantColor.dot }}>{icon}</div>
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-lg"
              style={{ backgroundColor: variantColor.bg, color: variantColor.dot }}
            >
              {count}
            </span>
          </div>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-1 max-h-[320px] overflow-y-auto">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Issue Row (for Needs Attention) ──────────────────────────────────────────

const reasonConfig: Record<string, { icon: typeof Clock; label: string; color: string }> = {
  overdue: { icon: AlertTriangle, label: "Overdue", color: "#ef4444" },
  "due-today": { icon: Clock, label: "Due today", color: "#f59e0b" },
  stale: { icon: Clock, label: "Stale", color: "#f97316" },
  mentioned: { icon: Clock, label: "Mentioned", color: "#3b82f6" },
  "high-priority": { icon: Flame, label: "High", color: "#a855f7" },
};

function IssueRow({ item, base }: { item: QueueItem; base: string }) {
  const config = reasonConfig[item.reason] || reasonConfig.overdue;

  return (
    <Link
      href={`${base}/issue/${item.id}`}
      className="group flex items-center gap-3 p-2 rounded-lg hover:bg-collab-900 transition-colors"
    >
      <div
        className="w-1 h-8 rounded-full flex-shrink-0"
        style={{ backgroundColor: config.color }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs text-collab-500 font-mono">{item.issueKey}</span>
        </div>
        <p className="text-sm text-collab-400 group-hover:text-white truncate transition-colors">
          {item.title}
        </p>
      </div>
      <span
        className="text-[10px] px-1.5 py-0.5 rounded-lg flex-shrink-0"
        style={{ backgroundColor: `${config.color}15`, color: config.color }}
      >
        {item.reason === "overdue" && item.daysOverdue
          ? `${item.daysOverdue}d`
          : config.label}
      </span>
    </Link>
  );
}

// ─── Work Row (for In Progress, Review, Deploy) ───────────────────────────────

function WorkRow({ item, base }: { item: WorkItem; base: string }) {
  return (
    <Link
      href={`${base}/issue/${item.id}`}
      className="group flex items-center gap-3 p-2 rounded-lg hover:bg-collab-900 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs text-collab-500 font-mono">{item.issueKey}</span>
          {item.daysInStatus > 2 && (
            <span className="text-[10px] px-1 py-0.5 rounded-lg bg-amber-400/10 text-amber-400">
              {item.daysInStatus}d
            </span>
          )}
        </div>
        <p className="text-sm text-collab-400 group-hover:text-white truncate transition-colors">
          {item.title}
        </p>
      </div>
    </Link>
  );
}

// ─── Dashboard Empty State ───────────────────────────────────────────────────

function DashboardEmptyState({ text }: { text: string }) {
  return (
    <div className="py-8 text-center">
      <div
        className="w-full h-16 rounded-lg mb-3"
        style={{
          backgroundImage: "radial-gradient(circle, #1f1f22 1px, transparent 1px)",
          backgroundSize: "8px 8px",
        }}
      />
      <p className="text-xs text-collab-500">{text}</p>
    </div>
  );
}
