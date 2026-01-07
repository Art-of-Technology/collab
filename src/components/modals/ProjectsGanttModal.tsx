"use client";

import { useMemo, useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2,
  BarChart3,
  X,
  ChevronLeft,
  ChevronRight,
  Calendar,
  FolderOpen,
  AlertTriangle,
  CheckCircle2,
  Clock,
  AlertCircle,
  ZoomIn,
  ZoomOut,
  Filter,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, differenceInDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, startOfWeek, endOfWeek, addMonths, subMonths, isWeekend } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type HealthStatus = 'on_track' | 'at_risk' | 'overdue' | 'completed' | 'no_data';

interface ProjectGanttData {
  id: string;
  name: string;
  slug: string;
  color: string;
  description: string | null;
  startDate: string;
  dueDate: string;
  issueCount: number;
  issuesWithDates: number;
  completedIssues: number;
  overdueIssues: number;
  progress: number;
  health: HealthStatus;
  hasRealDates: boolean;
}

interface ProjectsGanttModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
}

const healthConfig: Record<HealthStatus, { label: string; color: string; bgColor: string; icon: React.ComponentType<{ className?: string }> }> = {
  on_track: { label: 'On Track', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20', icon: CheckCircle2 },
  at_risk: { label: 'At Risk', color: 'text-amber-400', bgColor: 'bg-amber-500/20', icon: AlertTriangle },
  overdue: { label: 'Overdue', color: 'text-red-400', bgColor: 'bg-red-500/20', icon: AlertCircle },
  completed: { label: 'Completed', color: 'text-blue-400', bgColor: 'bg-blue-500/20', icon: CheckCircle2 },
  no_data: { label: 'No Timeline', color: 'text-[#666]', bgColor: 'bg-[#333]/50', icon: Clock },
};

type ZoomLevel = 'day' | 'week';

export default function ProjectsGanttModal({
  isOpen,
  onClose,
  workspaceId
}: ProjectsGanttModalProps) {
  const [viewDate, setViewDate] = useState(new Date());
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('day');
  const [healthFilter, setHealthFilter] = useState<HealthStatus[]>([]);
  const [showNoData, setShowNoData] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const projectListRef = useRef<HTMLDivElement>(null);

  // Fetch projects gantt data
  const { data: ganttData, isLoading } = useQuery({
    queryKey: ['projects-gantt', workspaceId],
    queryFn: async () => {
      const response = await fetch(`/api/workspaces/${workspaceId}/projects/gantt`);
      if (!response.ok) {
        throw new Error('Failed to fetch gantt data');
      }
      const data = await response.json();
      return data.projects as ProjectGanttData[];
    },
    enabled: isOpen && !!workspaceId,
  });

  // Filter projects based on health filter
  const filteredProjects = useMemo(() => {
    if (!ganttData) return [];

    let projects = ganttData;

    // Apply health filter
    if (healthFilter.length > 0) {
      projects = projects.filter(p => healthFilter.includes(p.health));
    }

    // Apply no data filter
    if (!showNoData) {
      projects = projects.filter(p => p.hasRealDates);
    }

    return projects;
  }, [ganttData, healthFilter, showNoData]);

  // Calculate statistics
  const stats = useMemo(() => {
    if (!ganttData) return { total: 0, onTrack: 0, atRisk: 0, overdue: 0, completed: 0, noData: 0 };
    return {
      total: ganttData.length,
      onTrack: ganttData.filter(p => p.health === 'on_track').length,
      atRisk: ganttData.filter(p => p.health === 'at_risk').length,
      overdue: ganttData.filter(p => p.health === 'overdue').length,
      completed: ganttData.filter(p => p.health === 'completed').length,
      noData: ganttData.filter(p => p.health === 'no_data').length,
    };
  }, [ganttData]);

  // Calculate timeline range (show 3 months centered on current view)
  const timelineRange = useMemo(() => {
    const start = startOfMonth(subMonths(viewDate, 1));
    const end = endOfMonth(addMonths(viewDate, 1));
    return { start, end };
  }, [viewDate]);

  // Generate days for the timeline
  const timelineDays = useMemo(() => {
    return eachDayOfInterval({ start: timelineRange.start, end: timelineRange.end });
  }, [timelineRange]);

  // Group days by week for week view
  const timelineWeeks = useMemo(() => {
    const weeks: { start: Date; end: Date; days: Date[] }[] = [];
    let currentWeekStart: Date | null = null;
    let currentWeekDays: Date[] = [];

    timelineDays.forEach(day => {
      const weekStart = startOfWeek(day, { weekStartsOn: 1 });

      if (!currentWeekStart || weekStart.getTime() !== currentWeekStart.getTime()) {
        if (currentWeekStart && currentWeekDays.length > 0) {
          weeks.push({
            start: currentWeekStart,
            end: endOfWeek(currentWeekStart, { weekStartsOn: 1 }),
            days: currentWeekDays
          });
        }
        currentWeekStart = weekStart;
        currentWeekDays = [day];
      } else {
        currentWeekDays.push(day);
      }
    });

    if (currentWeekStart && currentWeekDays.length > 0) {
      weeks.push({
        start: currentWeekStart,
        end: endOfWeek(currentWeekStart, { weekStartsOn: 1 }),
        days: currentWeekDays
      });
    }

    return weeks;
  }, [timelineDays]);

  // Group days by month for header
  const monthGroups = useMemo(() => {
    const groups: { month: Date; days: Date[] }[] = [];
    let currentMonth: Date | null = null;
    let currentDays: Date[] = [];

    timelineDays.forEach(day => {
      if (!currentMonth || !isSameMonth(day, currentMonth)) {
        if (currentMonth && currentDays.length > 0) {
          groups.push({ month: currentMonth, days: currentDays });
        }
        currentMonth = day;
        currentDays = [day];
      } else {
        currentDays.push(day);
      }
    });

    if (currentMonth && currentDays.length > 0) {
      groups.push({ month: currentMonth, days: currentDays });
    }

    return groups;
  }, [timelineDays]);

  const dayWidth = zoomLevel === 'day' ? 32 : 12;
  const totalWidth = timelineDays.length * dayWidth;

  // Calculate bar position and width for a project
  const getBarStyle = (project: ProjectGanttData) => {
    const projectStart = new Date(project.startDate);
    const projectEnd = new Date(project.dueDate);

    const timelineStart = timelineRange.start;

    const startOffset = Math.max(0, differenceInDays(projectStart, timelineStart));
    const endOffset = differenceInDays(projectEnd, timelineStart);
    const duration = Math.max(1, endOffset - startOffset + 1);

    // Check if project is visible in current timeline
    const isVisible = projectEnd >= timelineStart && projectStart <= timelineRange.end;

    return {
      left: startOffset * dayWidth,
      width: duration * dayWidth,
      isVisible
    };
  };

  // Navigation handlers
  const goToPreviousMonth = () => setViewDate(subMonths(viewDate, 1));
  const goToNextMonth = () => setViewDate(addMonths(viewDate, 1));
  const goToToday = () => setViewDate(new Date());

  // Scroll to today on open
  useEffect(() => {
    if (isOpen && scrollContainerRef.current) {
      const todayOffset = differenceInDays(new Date(), timelineRange.start);
      const scrollPosition = Math.max(0, (todayOffset * dayWidth) - 200);

      setTimeout(() => {
        scrollContainerRef.current?.scrollTo({ left: scrollPosition, behavior: 'smooth' });
      }, 100);
    }
  }, [isOpen, timelineRange.start, dayWidth]);

  // Sync vertical scroll between project list and timeline
  const handleTimelineScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (projectListRef.current) {
      projectListRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const handleProjectListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const toggleHealthFilter = (health: HealthStatus) => {
    setHealthFilter(prev =>
      prev.includes(health)
        ? prev.filter(h => h !== health)
        : [...prev, health]
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh] p-0 bg-[#0e0e0e] border-[#1a1a1a] overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Projects Timeline</DialogTitle>
        </DialogHeader>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-md flex items-center justify-center bg-blue-500/20">
              <BarChart3 className="h-3.5 w-3.5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-medium text-[#e6edf3]">Projects Timeline</h2>
              <p className="text-xs text-[#666]">
                Track project progress and deadlines
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Stats Summary */}
            {ganttData && ganttData.length > 0 && (
              <div className="flex items-center gap-2 mr-2">
                {stats.overdue > 0 && (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/10">
                    <AlertCircle className="h-3 w-3 text-red-400" />
                    <span className="text-xs text-red-400 font-medium">{stats.overdue}</span>
                  </div>
                )}
                {stats.atRisk > 0 && (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/10">
                    <AlertTriangle className="h-3 w-3 text-amber-400" />
                    <span className="text-xs text-amber-400 font-medium">{stats.atRisk}</span>
                  </div>
                )}
                {stats.onTrack > 0 && (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10">
                    <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                    <span className="text-xs text-emerald-400 font-medium">{stats.onTrack}</span>
                  </div>
                )}
              </div>
            )}

            {/* View Controls */}
            <div className="flex items-center gap-1 border-r border-[#1a1a1a] pr-3">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setZoomLevel(zoomLevel === 'day' ? 'week' : 'day')}
                      className="h-7 w-7 p-0 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1a1a]"
                    >
                      {zoomLevel === 'day' ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{zoomLevel === 'day' ? 'Switch to week view' : 'Switch to day view'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-7 w-7 p-0 hover:bg-[#1a1a1a]",
                      healthFilter.length > 0 || !showNoData ? "text-blue-400" : "text-[#8b949e] hover:text-[#e6edf3]"
                    )}
                  >
                    <Filter className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-[#161617] border-[#1f1f1f]">
                  <div className="px-2 py-1.5 text-xs text-[#666]">Filter by status</div>
                  {(['on_track', 'at_risk', 'overdue', 'completed'] as HealthStatus[]).map(health => {
                    const config = healthConfig[health];
                    return (
                      <DropdownMenuCheckboxItem
                        key={health}
                        checked={healthFilter.includes(health)}
                        onCheckedChange={() => toggleHealthFilter(health)}
                        className="text-[#e6edf3] focus:bg-[#1f1f1f] cursor-pointer"
                      >
                        <span className={config.color}>{config.label}</span>
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                  <DropdownMenuSeparator className="bg-[#1f1f1f]" />
                  <DropdownMenuCheckboxItem
                    checked={showNoData}
                    onCheckedChange={setShowNoData}
                    className="text-[#e6edf3] focus:bg-[#1f1f1f] cursor-pointer"
                  >
                    Show projects without dates
                  </DropdownMenuCheckboxItem>
                  {(healthFilter.length > 0 || !showNoData) && (
                    <>
                      <DropdownMenuSeparator className="bg-[#1f1f1f]" />
                      <DropdownMenuItem
                        onClick={() => { setHealthFilter([]); setShowNoData(true); }}
                        className="text-[#8b949e] focus:bg-[#1f1f1f] cursor-pointer"
                      >
                        Clear filters
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Navigation Controls */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={goToPreviousMonth}
                className="h-7 w-7 p-0 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1a1a]"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={goToToday}
                className="h-7 px-2 text-xs text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1a1a]"
              >
                <Calendar className="h-3 w-3 mr-1" />
                Today
              </Button>
              <span className="text-sm font-medium text-[#e6edf3] min-w-[120px] text-center">
                {format(viewDate, 'MMMM yyyy')}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={goToNextMonth}
                className="h-7 w-7 p-0 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1a1a]"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-6 w-6 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1a1a]"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(90vh - 120px)' }}>
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-[#8b949e]" />
            </div>
          ) : !ganttData || ganttData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[#8b949e]">
              <div className="text-center">
                <FolderOpen className="h-12 w-12 mx-auto mb-4 text-[#666]" />
                <p className="text-base">No projects found</p>
                <p className="text-sm text-[#666] mt-1">
                  Create a project to see it on the timeline
                </p>
              </div>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[#8b949e]">
              <div className="text-center">
                <Filter className="h-12 w-12 mx-auto mb-4 text-[#666]" />
                <p className="text-base">No projects match your filters</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setHealthFilter([]); setShowNoData(true); }}
                  className="mt-2 text-blue-400 hover:text-blue-300"
                >
                  Clear filters
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 overflow-hidden">
              {/* Project Names Column (Fixed) */}
              <div className="w-72 flex-shrink-0 border-r border-[#1a1a1a] bg-[#0e0e0e] flex flex-col">
                {/* Header spacer */}
                <div className="h-[56px] border-b border-[#1a1a1a] flex items-end px-3 pb-2 flex-shrink-0">
                  <span className="text-xs font-medium text-[#8b949e]">
                    {filteredProjects.length} Project{filteredProjects.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Project list */}
                <div
                  ref={projectListRef}
                  className="overflow-y-auto flex-1 scrollbar-hidden"
                  onScroll={handleProjectListScroll}
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {filteredProjects.map((project) => {
                    const health = healthConfig[project.health];
                    const HealthIcon = health.icon;

                    return (
                      <div
                        key={project.id}
                        className={cn(
                          "h-14 flex items-center px-3 border-b border-[#1a1a1a] hover:bg-[#161616] transition-colors",
                          !project.hasRealDates && "opacity-60"
                        )}
                      >
                        <div
                          className="w-3 h-3 rounded-sm mr-2 flex-shrink-0"
                          style={{ backgroundColor: project.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-[#e6edf3] truncate">
                              {project.name}
                            </span>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <HealthIcon className={cn("h-3.5 w-3.5 flex-shrink-0", health.color)} />
                                </TooltipTrigger>
                                <TooltipContent side="right">
                                  <p className="font-medium">{health.label}</p>
                                  {project.hasRealDates ? (
                                    <p className="text-xs text-[#8b949e]">
                                      {project.progress}% complete ({project.completedIssues}/{project.issueCount})
                                    </p>
                                  ) : (
                                    <p className="text-xs text-[#8b949e]">
                                      No issues with dates assigned
                                    </p>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-[#666]">
                              {project.completedIssues}/{project.issueCount} issues
                            </span>
                            {project.overdueIssues > 0 && (
                              <span className="text-xs text-red-400">
                                {project.overdueIssues} overdue
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Timeline Area (Scrollable) */}
              <div className="flex-1 overflow-hidden flex flex-col">
                {/* Fixed headers */}
                <div className="flex-shrink-0">
                  {/* Month headers */}
                  <div className="h-7 flex border-b border-[#1a1a1a] bg-[#0e0e0e]">
                    {monthGroups.map((group, idx) => (
                      <div
                        key={idx}
                        className="flex-shrink-0 border-r border-[#1a1a1a] flex items-center justify-center"
                        style={{ width: group.days.length * dayWidth }}
                      >
                        <span className="text-xs font-medium text-[#8b949e]">
                          {format(group.month, 'MMMM yyyy')}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Day/Week headers */}
                  <div className="h-7 flex border-b border-[#1a1a1a] bg-[#0e0e0e]">
                    {zoomLevel === 'day' ? (
                      timelineDays.map((day, idx) => (
                        <div
                          key={idx}
                          className={cn(
                            "flex-shrink-0 flex items-center justify-center border-r border-[#1a1a1a]/50",
                            isToday(day) && "bg-blue-500/10",
                            isWeekend(day) && "bg-[#1a1a1a]/30"
                          )}
                          style={{ width: dayWidth }}
                        >
                          <span className={cn(
                            "text-[10px]",
                            isToday(day) ? "text-blue-400 font-medium" : isWeekend(day) ? "text-[#444]" : "text-[#666]"
                          )}>
                            {format(day, 'd')}
                          </span>
                        </div>
                      ))
                    ) : (
                      timelineWeeks.map((week, idx) => (
                        <div
                          key={idx}
                          className="flex-shrink-0 flex items-center justify-center border-r border-[#1a1a1a]"
                          style={{ width: week.days.length * dayWidth }}
                        >
                          <span className="text-[10px] text-[#666]">
                            W{format(week.start, 'w')}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Scrollable timeline content */}
                <div
                  ref={scrollContainerRef}
                  className="flex-1 overflow-auto"
                  onScroll={handleTimelineScroll}
                >
                  <div style={{ width: totalWidth, minWidth: '100%' }}>
                    {/* Grid and bars container */}
                    <div className="relative" style={{ height: filteredProjects.length * 56 }}>
                      {/* Today line */}
                      {(() => {
                        const todayOffset = differenceInDays(new Date(), timelineRange.start);
                        if (todayOffset >= 0 && todayOffset < timelineDays.length) {
                          return (
                            <div
                              className="absolute top-0 bottom-0 w-0.5 bg-blue-500 z-20"
                              style={{ left: todayOffset * dayWidth + dayWidth / 2 }}
                            >
                              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-blue-500" />
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {/* Grid lines */}
                      <div className="absolute inset-0 flex">
                        {timelineDays.map((day, idx) => (
                          <div
                            key={idx}
                            className={cn(
                              "flex-shrink-0 border-r border-[#1a1a1a]/30",
                              isToday(day) && "bg-blue-500/5",
                              isWeekend(day) && "bg-[#1a1a1a]/20"
                            )}
                            style={{ width: dayWidth, height: '100%' }}
                          />
                        ))}
                      </div>

                      {/* Project bars */}
                      {filteredProjects.map((project, idx) => {
                        const barStyle = getBarStyle(project);
                        const health = healthConfig[project.health];

                        return (
                          <div
                            key={project.id}
                            className="absolute h-14 flex items-center border-b border-[#1a1a1a]/30"
                            style={{
                              top: idx * 56,
                              left: 0,
                              right: 0
                            }}
                          >
                            {barStyle.isVisible && (
                              <TooltipProvider>
                                <Tooltip delayDuration={100}>
                                  <TooltipTrigger asChild>
                                    <div
                                      className={cn(
                                        "absolute h-8 rounded-md cursor-pointer transition-all hover:brightness-110 overflow-hidden",
                                        !project.hasRealDates && "opacity-50 border border-dashed border-[#666]"
                                      )}
                                      style={{
                                        left: barStyle.left,
                                        width: Math.max(barStyle.width, 40),
                                        backgroundColor: project.hasRealDates ? project.color : 'transparent',
                                      }}
                                    >
                                      {/* Progress fill */}
                                      {project.hasRealDates && project.progress > 0 && project.progress < 100 && (
                                        <div
                                          className="absolute inset-0 bg-black/30"
                                          style={{
                                            left: `${project.progress}%`,
                                            width: `${100 - project.progress}%`
                                          }}
                                        />
                                      )}

                                      {/* Bar content */}
                                      <div className="relative h-full flex items-center justify-between px-2">
                                        {barStyle.width > 100 && (
                                          <span className="text-xs text-white font-medium truncate">
                                            {project.name}
                                          </span>
                                        )}
                                        {barStyle.width > 50 && project.hasRealDates && (
                                          <span className="text-[10px] text-white/80 ml-auto">
                                            {project.progress}%
                                          </span>
                                        )}
                                      </div>

                                      {/* Health indicator on bar end */}
                                      {project.health === 'overdue' && (
                                        <div className="absolute right-0 top-0 bottom-0 w-1 bg-red-500" />
                                      )}
                                      {project.health === 'at_risk' && (
                                        <div className="absolute right-0 top-0 bottom-0 w-1 bg-amber-500" />
                                      )}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="top"
                                    className="max-w-xs bg-[#1a1a1a] border-[#333] p-3"
                                  >
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2">
                                        <div
                                          className="w-3 h-3 rounded-sm"
                                          style={{ backgroundColor: project.color }}
                                        />
                                        <span className="font-medium text-white">{project.name}</span>
                                      </div>

                                      {project.hasRealDates ? (
                                        <>
                                          <div className="flex items-center gap-2">
                                            <span className={cn("text-xs px-1.5 py-0.5 rounded", health.bgColor, health.color)}>
                                              {health.label}
                                            </span>
                                            <span className="text-xs text-[#8b949e]">
                                              {project.progress}% complete
                                            </span>
                                          </div>

                                          <div className="text-xs text-[#8b949e] space-y-1">
                                            <div className="flex justify-between">
                                              <span>Timeline:</span>
                                              <span className="text-[#e6edf3]">
                                                {format(new Date(project.startDate), 'MMM d')} - {format(new Date(project.dueDate), 'MMM d, yyyy')}
                                              </span>
                                            </div>
                                            <div className="flex justify-between">
                                              <span>Issues:</span>
                                              <span className="text-[#e6edf3]">
                                                {project.completedIssues} of {project.issueCount} completed
                                              </span>
                                            </div>
                                            {project.overdueIssues > 0 && (
                                              <div className="flex justify-between text-red-400">
                                                <span>Overdue:</span>
                                                <span>{project.overdueIssues} issue{project.overdueIssues !== 1 ? 's' : ''}</span>
                                              </div>
                                            )}
                                            <div className="flex justify-between">
                                              <span>Duration:</span>
                                              <span className="text-[#e6edf3]">
                                                {differenceInDays(new Date(project.dueDate), new Date(project.startDate))} days
                                              </span>
                                            </div>
                                          </div>
                                        </>
                                      ) : (
                                        <div className="text-xs text-[#666] space-y-1">
                                          <div className="flex items-center gap-1.5">
                                            <Info className="h-3 w-3" />
                                            <span>No timeline data available</span>
                                          </div>
                                          <p className="text-[#555]">
                                            Add start/due dates to issues to see accurate project timeline
                                          </p>
                                          <div className="pt-1 border-t border-[#333]">
                                            <span className="text-[#8b949e]">
                                              {project.issueCount} issue{project.issueCount !== 1 ? 's' : ''} total
                                            </span>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer with legend */}
        <div className="px-4 py-2 border-t border-[#1a1a1a] flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-[#666]">
              <div className="w-3 h-0.5 bg-blue-500" />
              <span>Today</span>
            </div>
            <div className="flex items-center gap-3 border-l border-[#1a1a1a] pl-4">
              {(['on_track', 'at_risk', 'overdue', 'completed'] as HealthStatus[]).map(status => {
                const config = healthConfig[status];
                const Icon = config.icon;
                return (
                  <div key={status} className="flex items-center gap-1">
                    <Icon className={cn("h-3 w-3", config.color)} />
                    <span className="text-[#666]">{config.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2 text-[#666]">
            <Info className="h-3 w-3" />
            <span>Timeline based on issue start/due dates</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
