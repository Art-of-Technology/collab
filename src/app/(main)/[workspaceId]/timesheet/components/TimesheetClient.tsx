"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  Play,
  Pause,
  AlertCircle,
  Timer,
  RefreshCw,
  Target,
  Coffee,
  Users,
  Activity,
  ChevronLeft,
  ChevronRight,
  Filter,
  Sun,
  CalendarDays,
  Calendar,
  CheckCircle,
  Download,
  Eye,
  Search,
} from "lucide-react";
import { format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths, parseISO } from "date-fns";
import { useTimesheet, useTimesheetExport, usePrefetchTimesheet } from "@/hooks/queries/useTimesheet";
import type { TimesheetFilters } from "@/hooks/queries/useTimesheet";
import { useWorkspaceBoards } from "@/hooks/queries/useTask";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { TimesheetSummaryCards } from "./TimesheetSummaryCards";
import { TimesheetEntryCard } from "./TimesheetEntryCard";
import { TimesheetAnalytics } from "./TimesheetAnalytics";
import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/components/layout/PageHeader";

interface TimesheetClientProps {
  workspaceId: string;
  userId: string;
}

export function TimesheetClient({ workspaceId }: TimesheetClientProps) {
  const [filters, setFilters] = useState<TimesheetFilters>({
    view: "daily",
    date: new Date().toISOString(),
    boardId: undefined,
  });

  // Local filters for client-side filtering
  const [localFilters, setLocalFilters] = useState({
    activityType: "all", // all, work, break, lunch, meeting, travel, review, research
    status: "all", // all, ongoing, paused, completed
  });

  // Hooks
  const { data: timesheetData, isLoading, error, refetch } = useTimesheet(filters);
  const { data: boards } = useWorkspaceBoards(workspaceId);
  const exportMutation = useTimesheetExport();
  const prefetchTimesheet = usePrefetchTimesheet();
  const { settings, isLoading: isLoadingSettings } = useWorkspaceSettings();

  // Prefetch adjacent periods when filters change
  useEffect(() => {
    prefetchTimesheet(filters);
  }, [filters, prefetchTimesheet]);

  // Check if settings are still loading
  if (isLoadingSettings) {
    return (
      <div className="space-y-6">
        {/* Enhanced Header Skeleton */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-950/20 dark:via-indigo-950/20 dark:to-purple-950/20 border border-blue-100 dark:border-blue-900/30">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5" />
          <div className="relative p-6">
            <div className="flex flex-col lg:flex-row gap-6 justify-between items-start lg:items-center">
              {/* Live Activity Info Skeleton */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Skeleton className="h-12 w-12 rounded-xl animate-pulse" />
                    <div className="absolute -top-1 -right-1 h-4 w-4 bg-gray-300 dark:bg-gray-600 rounded-full animate-pulse" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-32 animate-pulse" />
                    <Skeleton className="h-4 w-48 animate-pulse" />
                  </div>
                </div>

                {/* Quick Stats Skeleton */}
                <div className="hidden md:flex items-center gap-6 pl-6 border-l border-gray-200 dark:border-gray-700">
                  <div className="text-center space-y-1">
                    <Skeleton className="h-8 w-16 mx-auto animate-pulse" />
                    <Skeleton className="h-3 w-12 mx-auto animate-pulse" />
                  </div>
                  <div className="text-center space-y-1">
                    <Skeleton className="h-6 w-12 mx-auto animate-pulse" />
                    <Skeleton className="h-3 w-16 mx-auto animate-pulse" />
                  </div>
                  <div className="text-center space-y-1">
                    <Skeleton className="h-6 w-8 mx-auto animate-pulse" />
                    <Skeleton className="h-3 w-10 mx-auto animate-pulse" />
                  </div>
                </div>
              </div>

              {/* View Controls Skeleton */}
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-48 rounded-lg animate-pulse" />
              </div>
            </div>

            {/* Navigation and Actions Skeleton */}
            <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center mt-6">
              {/* Date Navigation Skeleton */}
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded animate-pulse" />
                <Skeleton className="h-8 w-24 rounded animate-pulse" />
                <Skeleton className="h-8 w-8 rounded animate-pulse" />
              </div>

              {/* Filters and Actions Skeleton */}
              <div className="flex items-center gap-2 flex-wrap">
                <Skeleton className="h-8 w-32 rounded animate-pulse" />
                <Skeleton className="h-8 w-32 rounded animate-pulse" />
                <Skeleton className="h-8 w-32 rounded animate-pulse" />
                <Skeleton className="h-8 w-20 rounded animate-pulse" />
                <Skeleton className="h-8 w-8 rounded animate-pulse" />
              </div>
            </div>
          </div>
        </div>

        {/* Summary Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 rounded animate-pulse" />
                  <Skeleton className="h-4 w-20 animate-pulse" />
                </div>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2 animate-pulse" />
                <Skeleton className="h-3 w-24 animate-pulse" />
                <div className="mt-3">
                  <Skeleton className="h-2 w-full rounded-full animate-pulse" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs Skeleton */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-20 rounded-lg animate-pulse" />
            <Skeleton className="h-10 w-20 rounded-lg animate-pulse" />
          </div>
        </div>

        {/* Entries Skeleton */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-40 animate-pulse" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-16 rounded-full animate-pulse" />
              <Skeleton className="h-6 w-16 rounded-full animate-pulse" />
            </div>
          </div>

          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-lg animate-pulse" />
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-5 w-32 animate-pulse" />
                        <Skeleton className="h-5 w-16 rounded-full animate-pulse" />
                      </div>
                      <Skeleton className="h-4 w-48 animate-pulse" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-20 rounded animate-pulse" />
                    <Skeleton className="h-8 w-8 rounded animate-pulse" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-16 animate-pulse" />
                    <Skeleton className="h-5 w-20 animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-12 animate-pulse" />
                    <Skeleton className="h-5 w-16 animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-14 animate-pulse" />
                    <Skeleton className="h-5 w-18 animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-18 animate-pulse" />
                    <Skeleton className="h-5 w-24 animate-pulse" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Check if time tracking is enabled
  if (!settings?.timeTrackingEnabled) {
    return (
      <Card className="p-8 text-center">
        <AlertCircle className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Time Tracking Disabled</h3>
        <p className="text-muted-foreground mb-4">
          Time tracking is not enabled in this workspace. Contact your administrator to enable it.
        </p>
      </Card>
    );
  }

  const handleViewChange = (view: string) => {
    if (view === "daily" || view === "weekly" || view === "monthly") {
      setFilters((prev) => ({ ...prev, view }));
    }
  };

  const handleDateNavigation = (direction: "prev" | "next") => {
    const currentDate = parseISO(filters.date);
    let newDate: Date;

    switch (filters.view) {
      case "daily":
        newDate = direction === "next" ? addDays(currentDate, 1) : subDays(currentDate, 1);
        break;
      case "weekly":
        newDate = direction === "next" ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1);
        break;
      case "monthly":
        newDate = direction === "next" ? addMonths(currentDate, 1) : subMonths(currentDate, 1);
        break;
    }

    setFilters((prev) => ({ ...prev, date: newDate.toISOString() }));
  };

  const handleBoardFilter = (boardId: string) => {
    setFilters((prev) => ({
      ...prev,
      boardId: boardId === "all" ? undefined : boardId,
    }));
  };

  const handleExport = (format: "csv" | "pdf") => {
    exportMutation.mutate({ ...filters, format });
  };

  // Filter entries based on local filters
  const filteredEntries =
    timesheetData?.entries.filter((entry) => {
      const activityTypeMatch = localFilters.activityType === "all" || entry.activityType === localFilters.activityType;
      const statusMatch = localFilters.status === "all" || entry.status === localFilters.status;
      return activityTypeMatch && statusMatch;
    }) || [];

  const formatDateRange = () => {
    const date = parseISO(filters.date);
    switch (filters.view) {
      case "daily":
        return format(date, "EEEE, MMMM d, yyyy");
      case "weekly":
        const weekStart = subDays(date, date.getDay() - 1); // Monday
        const weekEnd = addDays(weekStart, 6); // Sunday
        return `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d, yyyy")}`;
      case "monthly":
        return format(date, "MMMM yyyy");
    }
  };

  if (error) {
    return (
      <Card className="p-8 text-center">
        <AlertCircle className="h-16 w-16 mx-auto text-destructive mb-4" />
        <h3 className="text-lg font-semibold mb-2">Error Loading Timesheet</h3>
        <p className="text-muted-foreground mb-4">{error.message}</p>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        icon={Timer}
        title="Timesheet"
        subtitle="Track and analyze your time spent on tasks and activities"
      />
      <div className="space-y-6 p-4 md:p-6">
        {/* Enhanced Header */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-950/20 dark:via-indigo-950/20 dark:to-purple-950/20 border border-blue-100 dark:border-blue-900/30">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5" />
          <div className="relative p-6">
            <div className="flex flex-col lg:flex-row gap-6 justify-between items-start lg:items-center">
              {/* Live Activity Info */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg flex items-center justify-center">
                      <Activity className="h-6 w-6 text-white" />
                    </div>
                    {(timesheetData?.summary?.totalActiveTasks ?? 0) > 0 && (
                      <div className="absolute -top-1 -right-1 h-4 w-4 bg-green-500 rounded-full animate-pulse flex items-center justify-center">
                        <div className="h-2 w-2 bg-white rounded-full" />
                      </div>
                    )}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Time Tracking</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-300">{formatDateRange()}</p>
                  </div>
                </div>

                {/* Quick Stats */}
                {timesheetData && (
                  <div className="hidden md:flex items-center gap-6 pl-6 border-l border-gray-200 dark:border-gray-700">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {timesheetData.summary.formattedTotalWorkTime}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Work Time</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold text-blue-600 dark:text-blue-400">{timesheetData.summary.productivityScore}%</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Productivity</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold text-purple-600 dark:text-purple-400">{timesheetData.summary.totalActiveTasks}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Active</div>
                    </div>
                  </div>
                )}
              </div>

              {/* View Controls */}
              <div className="flex items-center gap-3">
                <Tabs value={filters.view} onValueChange={handleViewChange}>
                  <TabsList className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm">
                    <TabsTrigger value="daily" className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700">
                      <Sun className="h-4 w-4 mr-2" />
                      Daily
                    </TabsTrigger>
                    <TabsTrigger value="weekly" className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700">
                      <CalendarDays className="h-4 w-4 mr-2" />
                      Weekly
                    </TabsTrigger>
                    <TabsTrigger value="monthly" className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700">
                      <Calendar className="h-4 w-4 mr-2" />
                      Monthly
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>

            {/* Navigation and Actions */}
            <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center mt-6">
              {/* Date Navigation */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDateNavigation("prev")}
                  className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm hover:bg-white dark:hover:bg-gray-700"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFilters((prev) => ({ ...prev, date: new Date().toISOString() }))}
                  className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm hover:bg-white dark:hover:bg-gray-700 min-w-[120px]"
                >
                  <Target className="h-4 w-4 mr-2" />
                  Today
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDateNavigation("next")}
                  className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm hover:bg-white dark:hover:bg-gray-700"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Filters and Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={filters.boardId || "all"} onValueChange={handleBoardFilter}>
                  <SelectTrigger className="w-[140px] bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-white/20">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Board" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Boards</SelectItem>
                    {boards?.map((board: any) => (
                      <SelectItem key={board.id} value={board.id}>
                        {board.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={localFilters.activityType}
                  onValueChange={(value) => setLocalFilters((prev) => ({ ...prev, activityType: value }))}
                >
                  <SelectTrigger className="w-[140px] bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-white/20">
                    <Activity className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="work">
                      <div className="flex items-center gap-2">
                        <Target className="h-3 w-3 text-green-400" />
                        Work
                      </div>
                    </SelectItem>
                    <SelectItem value="break">
                      <div className="flex items-center gap-2">
                        <Coffee className="h-3 w-3 text-blue-400" />
                        Break
                      </div>
                    </SelectItem>
                    <SelectItem value="lunch">
                      <div className="flex items-center gap-2">
                        <Coffee className="h-3 w-3 text-orange-400" />
                        Lunch
                      </div>
                    </SelectItem>
                    <SelectItem value="meeting">
                      <div className="flex items-center gap-2">
                        <Users className="h-3 w-3 text-purple-400" />
                        Meeting
                      </div>
                    </SelectItem>
                    <SelectItem value="travel">
                      <div className="flex items-center gap-2">
                        <Activity className="h-3 w-3 text-indigo-400" />
                        Travel
                      </div>
                    </SelectItem>
                    <SelectItem value="review">
                      <div className="flex items-center gap-2">
                        <Eye className="h-3 w-3 text-teal-400" />
                        Review
                      </div>
                    </SelectItem>
                    <SelectItem value="research">
                      <div className="flex items-center gap-2">
                        <Search className="h-3 w-3 text-cyan-400" />
                        Research
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Select value={localFilters.status} onValueChange={(value) => setLocalFilters((prev) => ({ ...prev, status: value }))}>
                  <SelectTrigger className="w-[140px] bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-white/20">
                    <Timer className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="ongoing">
                      <div className="flex items-center gap-2">
                        <Play className="h-3 w-3 text-green-600" />
                        Ongoing
                      </div>
                    </SelectItem>
                    <SelectItem value="paused">
                      <div className="flex items-center gap-2">
                        <Pause className="h-3 w-3 text-amber-600" />
                        Paused
                      </div>
                    </SelectItem>
                    <SelectItem value="completed">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-3 w-3 text-blue-600" />
                        Completed
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-white/20 hover:bg-white dark:hover:bg-gray-700"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleExport("csv")} className="cursor-pointer">
                      <Download className="h-4 w-4 mr-2" />
                      Export CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport("pdf")} className="cursor-pointer">
                      <Download className="h-4 w-4 mr-2" />
                      Export PDF
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  disabled={isLoading}
                  className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm hover:bg-white dark:hover:bg-gray-700"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-6">
            {/* Summary Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-4 rounded animate-pulse" />
                      <Skeleton className="h-4 w-20 animate-pulse" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-16 mb-2 animate-pulse" />
                    <Skeleton className="h-3 w-24 animate-pulse" />
                    <div className="mt-3">
                      <Skeleton className="h-2 w-full rounded-full animate-pulse" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Tabs Skeleton */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Skeleton className="h-10 w-20 rounded-lg animate-pulse" />
                <Skeleton className="h-10 w-20 rounded-lg animate-pulse" />
              </div>
            </div>

            {/* Entries Skeleton */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-6 w-40 animate-pulse" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-6 w-16 rounded-full animate-pulse" />
                  <Skeleton className="h-6 w-16 rounded-full animate-pulse" />
                </div>
              </div>

              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-lg animate-pulse" />
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-5 w-32 animate-pulse" />
                            <Skeleton className="h-5 w-16 rounded-full animate-pulse" />
                          </div>
                          <Skeleton className="h-4 w-48 animate-pulse" />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-8 w-20 rounded animate-pulse" />
                        <Skeleton className="h-8 w-8 rounded animate-pulse" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <Skeleton className="h-3 w-16 animate-pulse" />
                        <Skeleton className="h-5 w-20 animate-pulse" />
                      </div>
                      <div className="space-y-1">
                        <Skeleton className="h-3 w-12 animate-pulse" />
                        <Skeleton className="h-5 w-16 animate-pulse" />
                      </div>
                      <div className="space-y-1">
                        <Skeleton className="h-3 w-14 animate-pulse" />
                        <Skeleton className="h-5 w-18 animate-pulse" />
                      </div>
                      <div className="space-y-1">
                        <Skeleton className="h-3 w-18 animate-pulse" />
                        <Skeleton className="h-5 w-24 animate-pulse" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : timesheetData ? (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              {/* Summary Cards */}
              <TimesheetSummaryCards summary={timesheetData.summary} />

              {/* Entries */}
              <div className="space-y-4">
                {filteredEntries.length === 0 ? (
                  <Card className="p-8 text-center">
                    <Timer className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">
                      {timesheetData.entries.length === 0 ? "No Time Tracked" : "No Matching Entries"}
                    </h3>
                    <p className="text-muted-foreground">
                      {timesheetData.entries.length === 0
                        ? "No time tracking data found for the selected period."
                        : "No entries match the current filters. Try adjusting your filter criteria."}
                    </p>
                    {timesheetData.entries.length > 0 && filteredEntries.length === 0 && (
                      <Button variant="outline" className="mt-4" onClick={() => setLocalFilters({ activityType: "all", status: "all" })}>
                        Clear Filters
                      </Button>
                    )}
                  </Card>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">
                        Time Entries ({filteredEntries.length}
                        {filteredEntries.length !== timesheetData.entries.length && (
                          <span className="text-muted-foreground"> of {timesheetData.entries.length}</span>
                        )}
                        )
                      </h3>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Play className="h-3 w-3" />
                          {filteredEntries.filter((e) => e.status === "ongoing").length} Active
                        </Badge>
                        <Badge variant="outline" className="flex items-center gap-1">
                          <Pause className="h-3 w-3" />
                          {filteredEntries.filter((e) => e.status === "paused").length} Paused
                        </Badge>
                      </div>
                    </div>

                    {filteredEntries.map((entry) => (
                      <TimesheetEntryCard key={entry.id} entry={entry} onRefresh={() => refetch()} />
                    ))}
                  </>
                )}
              </div>
            </TabsContent>

            <TabsContent value="analytics">
              <TimesheetAnalytics data={timesheetData} filters={filters} />
            </TabsContent>
          </Tabs>
        ) : null}
      </div>
    </>
  );
}
