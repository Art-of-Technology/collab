"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Sparkles, RefreshCw, TrendingUp, FolderKanban, CheckCircle2, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AIFocusItems, AIInsightsPanel, QuickActionsBar } from "@/components/dashboard";
import type { AIInsight } from "@/components/dashboard/AIInsightsPanel";

interface FocusItem {
  id: string;
  issueKey: string;
  title: string;
  priority: 'urgent' | 'high' | 'medium' | 'low' | null;
  status: string | null;
  statusColor?: string | null;
  dueDate?: string | null;
  assignee?: {
    name: string | null;
    image: string | null;
  } | null;
  project?: {
    name: string;
    color: string | null;
  } | null;
  reason: 'overdue' | 'due-today' | 'at-risk' | 'high-priority' | 'blocked';
}

interface DashboardStats {
  totalActive: number;
  totalProjects: number;
  completedThisWeek: number;
  recentActivity: number;
  overdueCount: number;
  unassignedCount: number;
}

interface AIDashboardProps {
  workspaceSlug: string;
  userName: string;
  onCreateIssue?: () => void;
}

function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  trend?: string;
  color: string;
}) {
  return (
    <div className="bg-[#1f1f1f]/50 border border-[#27272a] rounded-xl p-4 hover:border-[#3f3f46] transition-colors">
      <div className="flex items-center gap-3">
        <div className={cn("p-2.5 rounded-xl", color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-2xl font-semibold text-[#fafafa]">{value}</p>
          <p className="text-xs text-[#71717a]">{label}</p>
        </div>
        {trend && (
          <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}

export default function AIDashboard({ workspaceSlug, userName, onCreateIssue }: AIDashboardProps) {
  const [focusItems, setFocusItems] = useState<FocusItem[]>([]);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const params = useParams();

  const fetchDashboardData = async () => {
    try {
      const workspaceId = params?.workspaceId as string;
      if (!workspaceId) return;

      const response = await fetch(`/api/ai/dashboard?workspaceId=${workspaceId}`);
      if (!response.ok) throw new Error("Failed to fetch dashboard data");

      const data = await response.json();
      setFocusItems(data.focusItems || []);
      setInsights(data.insights || []);
      setStats(data.stats || null);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [params?.workspaceId]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchDashboardData();
  };

  const handleDismissInsight = (id: string) => {
    setInsights(prev => prev.filter(i => i.id !== id));
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const firstName = userName?.split(" ")[0] || "there";

  return (
    <div className="space-y-6">
      {/* Header with greeting */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-[#fafafa]">
              {getGreeting()}, {firstName}
            </h1>
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#8b5cf6]/10 border border-[#8b5cf6]/20 rounded-full">
              <Sparkles className="h-3 w-3 text-[#8b5cf6]" />
              <span className="text-[10px] text-[#c4b5fd] font-medium">AI Enhanced</span>
            </div>
          </div>
          <p className="text-sm text-[#71717a]">
            Here&apos;s what needs your attention today
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="text-[#71717a] hover:text-white"
        >
          <RefreshCw className={cn("h-4 w-4 mr-1.5", isRefreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Quick Actions */}
      <QuickActionsBar workspaceSlug={workspaceSlug} onCreateIssue={onCreateIssue} />

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            icon={TrendingUp}
            label="Active Issues"
            value={stats.totalActive}
            color="bg-blue-500/20 text-blue-400"
          />
          <StatCard
            icon={FolderKanban}
            label="Projects"
            value={stats.totalProjects}
            color="bg-purple-500/20 text-purple-400"
          />
          <StatCard
            icon={CheckCircle2}
            label="Completed This Week"
            value={stats.completedThisWeek}
            trend={stats.completedThisWeek > 0 ? `+${stats.completedThisWeek}` : undefined}
            color="bg-emerald-500/20 text-emerald-400"
          />
          <StatCard
            icon={Activity}
            label="Recent Activity"
            value={stats.recentActivity}
            color="bg-amber-500/20 text-amber-400"
          />
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Focus Items - Takes 2 columns */}
        <div className="lg:col-span-2 bg-[#0a0a0a] border border-[#27272a] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium text-[#fafafa]">Focus Items</h2>
              <span className="text-[10px] text-[#52525b]">
                AI prioritized for you
              </span>
            </div>
            {focusItems.length > 0 && (
              <span className="text-[10px] text-[#71717a]">
                {focusItems.length} item{focusItems.length !== 1 ? 's' : ''} need attention
              </span>
            )}
          </div>
          <AIFocusItems
            items={focusItems}
            workspaceSlug={workspaceSlug}
            isLoading={isLoading}
          />
        </div>

        {/* AI Insights - Takes 1 column */}
        <div className="bg-[#0a0a0a] border border-[#27272a] rounded-xl p-5">
          <AIInsightsPanel
            insights={insights}
            isLoading={isLoading}
            onDismiss={handleDismissInsight}
          />
        </div>
      </div>
    </div>
  );
}
