"use client";

import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  BarChart3,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Clock,
  AlertCircle,
  Filter,
  Info,
  Minus,
  Plus,
  RotateCcw,
  GripVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, differenceInDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, startOfWeek, endOfWeek, addMonths, subMonths, isWeekend, addDays, subDays, startOfDay, isSameDay } from 'date-fns';
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
import { useWorkspace } from '@/context/WorkspaceContext';

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

interface ProjectsTimelineClientProps {
  workspaceId: string;
}

const healthConfig: Record<HealthStatus, { label: string; color: string; bgColor: string; icon: React.ComponentType<{ className?: string }> }> = {
  on_track: { label: 'On Track', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20', icon: CheckCircle2 },
  at_risk: { label: 'At Risk', color: 'text-amber-400', bgColor: 'bg-amber-500/20', icon: AlertTriangle },
  overdue: { label: 'Overdue', color: 'text-red-400', bgColor: 'bg-red-500/20', icon: AlertCircle },
  completed: { label: 'Completed', color: 'text-blue-400', bgColor: 'bg-blue-500/20', icon: CheckCircle2 },
  no_data: { label: 'No Timeline', color: 'text-[#666]', bgColor: 'bg-[#333]/50', icon: Clock },
};

// Zoom levels configuration
const ZOOM_LEVELS = [8, 12, 16, 24, 32, 48, 64, 96] as const;
const DEFAULT_ZOOM_INDEX = 4; // 32px per day
const MIN_ZOOM = 0;
const MAX_ZOOM = ZOOM_LEVELS.length - 1;

// Fixed date range - 2 years before and after today for smooth scrolling
const DAYS_BEFORE = 365 * 2; // 2 years back
const DAYS_AFTER = 365 * 2; // 2 years forward

export default function ProjectsTimelineClient({ workspaceId }: ProjectsTimelineClientProps) {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();

  // State
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [healthFilter, setHealthFilter] = useState<HealthStatus[]>([]);
  const [showNoData, setShowNoData] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, scrollLeft: 0 });

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const projectListRef = useRef<HTMLDivElement>(null);
  const timelineAreaRef = useRef<HTMLDivElement>(null);

  // Calculate day width based on zoom
  const dayWidth = ZOOM_LEVELS[zoomIndex];

  // Fixed reference date (start of timeline)
  const timelineStartDate = useMemo(() => {
    const today = new Date();
    return subDays(startOfDay(today), DAYS_BEFORE);
  }, []);

  // Generate all visible dates (fixed range)
  const visibleDates = useMemo(() => {
    const end = addDays(timelineStartDate, DAYS_BEFORE + DAYS_AFTER);
    return eachDayOfInterval({ start: timelineStartDate, end });
  }, [timelineStartDate]);

  // Group dates by month
  const monthGroups = useMemo(() => {
    const groups: { month: Date; days: Date[]; startIndex: number }[] = [];
    let currentMonth: Date | null = null;
    let currentDays: Date[] = [];
    let startIndex = 0;

    visibleDates.forEach((day, idx) => {
      if (!currentMonth || !isSameMonth(day, currentMonth)) {
        if (currentMonth && currentDays.length > 0) {
          groups.push({ month: currentMonth, days: currentDays, startIndex });
        }
        currentMonth = day;
        currentDays = [day];
        startIndex = idx;
      } else {
        currentDays.push(day);
      }
    });

    if (currentMonth && currentDays.length > 0) {
      groups.push({ month: currentMonth, days: currentDays, startIndex });
    }

    return groups;
  }, [visibleDates]);

  // Calculate total timeline width
  const totalWidth = visibleDates.length * dayWidth;

  // Today's position is always at DAYS_BEFORE index (by definition of how we built the array)
  const todayIndex = DAYS_BEFORE;

  // Fetch data
  const { data: ganttData, isLoading } = useQuery({
    queryKey: ['projects-gantt', workspaceId],
    queryFn: async () => {
      const response = await fetch(`/api/workspaces/${workspaceId}/projects/gantt`);
      if (!response.ok) throw new Error('Failed to fetch gantt data');
      const data = await response.json();
      return data.projects as ProjectGanttData[];
    },
    enabled: !!workspaceId,
  });

  // Filter projects
  const filteredProjects = useMemo(() => {
    if (!ganttData) return [];
    let projects = ganttData;

    if (healthFilter.length > 0) {
      projects = projects.filter(p => healthFilter.includes(p.health));
    }

    if (!showNoData) {
      projects = projects.filter(p => p.hasRealDates);
    }

    return projects;
  }, [ganttData, healthFilter, showNoData]);

  // Statistics
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

  // Get bar position for a project
  const getBarStyle = useCallback((project: ProjectGanttData) => {
    const projectStart = startOfDay(new Date(project.startDate));
    const projectEnd = startOfDay(new Date(project.dueDate));
    const timelineStart = visibleDates[0];
    const timelineEnd = visibleDates[visibleDates.length - 1];

    // Check visibility
    if (projectEnd < timelineStart || projectStart > timelineEnd) {
      return { left: 0, width: 0, isVisible: false };
    }

    const startOffset = Math.max(0, differenceInDays(projectStart, timelineStart));
    const effectiveStart = projectStart < timelineStart ? timelineStart : projectStart;
    const effectiveEnd = projectEnd > timelineEnd ? timelineEnd : projectEnd;
    const duration = differenceInDays(effectiveEnd, effectiveStart) + 1;

    return {
      left: startOffset * dayWidth,
      width: Math.max(duration * dayWidth, dayWidth),
      isVisible: true
    };
  }, [visibleDates, dayWidth]);

  // Scroll to today on mount and when data loads
  const hasScrolledToToday = useRef(false);

  useEffect(() => {
    // Only auto-scroll once when data is loaded
    if (!isLoading && !hasScrolledToToday.current && containerRef.current) {
      const scrollToToday = () => {
        if (containerRef.current) {
          const containerWidth = containerRef.current.clientWidth;
          const scrollPosition = (todayIndex * dayWidth) - (containerWidth / 2);
          const finalPosition = Math.max(0, scrollPosition);

          containerRef.current.scrollLeft = finalPosition;

          // Also sync header scroll
          if (headerRef.current) {
            headerRef.current.scrollLeft = finalPosition;
          }

          hasScrolledToToday.current = true;
        }
      };

      // Small delay to ensure DOM is ready
      requestAnimationFrame(() => {
        requestAnimationFrame(scrollToToday);
      });
    }
  }, [isLoading, todayIndex, dayWidth]);

  // Handle zoom with wheel
  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();

      const delta = e.deltaY > 0 ? -1 : 1;
      setZoomIndex(prev => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta)));
    }
  }, []);

  // Attach wheel listener to entire timeline area for zoom
  useEffect(() => {
    const timelineArea = timelineAreaRef.current;
    if (timelineArea) {
      timelineArea.addEventListener('wheel', handleWheel, { passive: false });
      return () => timelineArea.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  // Handle drag to pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click

    // Don't start drag on interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[data-bar]')) return;

    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      scrollLeft: containerRef.current?.scrollLeft || 0
    });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;

    const dx = e.clientX - dragStart.x;
    containerRef.current.scrollLeft = dragStart.scrollLeft - dx;
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Sync scroll - both vertical (project list) and horizontal (headers)
  const handleTimelineScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollLeft, scrollTop } = e.currentTarget;

    // Sync vertical scroll with project list
    if (projectListRef.current) {
      projectListRef.current.scrollTop = scrollTop;
    }

    // Sync horizontal scroll with headers
    if (headerRef.current) {
      headerRef.current.scrollLeft = scrollLeft;
    }
  }, []);

  const handleProjectListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  }, []);

  // Zoom controls
  const zoomIn = () => setZoomIndex(prev => Math.min(MAX_ZOOM, prev + 1));
  const zoomOut = () => setZoomIndex(prev => Math.max(MIN_ZOOM, prev - 1));
  const resetZoom = () => setZoomIndex(DEFAULT_ZOOM_INDEX);

  // Go to today
  const goToToday = useCallback(() => {
    if (containerRef.current && todayIndex >= 0) {
      const containerWidth = containerRef.current.clientWidth;
      const scrollPosition = Math.max(0, (todayIndex * dayWidth) - (containerWidth / 2));

      containerRef.current.scrollTo({ left: scrollPosition, behavior: 'smooth' });

      // Also sync header (with smooth scroll we need to update on scroll events)
      if (headerRef.current) {
        headerRef.current.scrollTo({ left: scrollPosition, behavior: 'smooth' });
      }
    }
  }, [dayWidth, todayIndex]);

  const toggleHealthFilter = (health: HealthStatus) => {
    setHealthFilter(prev =>
      prev.includes(health)
        ? prev.filter(h => h !== health)
        : [...prev, health]
    );
  };

  const zoomPercentage = Math.round((zoomIndex / MAX_ZOOM) * 100);

  return (
    <div className="h-full flex flex-col bg-[#0a0a0b] overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-[#1a1a1a] bg-[#0a0a0b]">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/${currentWorkspace?.slug || workspaceId}/projects`)}
              className="h-8 px-2 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1a1a]"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Projects
            </Button>
            <div className="h-4 w-px bg-[#1a1a1a]" />
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md flex items-center justify-center bg-blue-500/20">
                <BarChart3 className="h-3.5 w-3.5 text-blue-400" />
              </div>
              <div>
                <h1 className="text-sm font-medium text-[#e6edf3]">Projects Timeline</h1>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Stats */}
            {ganttData && ganttData.length > 0 && (
              <div className="flex items-center gap-2 mr-2">
                {stats.overdue > 0 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/10 cursor-default">
                          <AlertCircle className="h-3 w-3 text-red-400" />
                          <span className="text-xs text-red-400 font-medium">{stats.overdue}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{stats.overdue} overdue project{stats.overdue !== 1 ? 's' : ''}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {stats.atRisk > 0 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/10 cursor-default">
                          <AlertTriangle className="h-3 w-3 text-amber-400" />
                          <span className="text-xs text-amber-400 font-medium">{stats.atRisk}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{stats.atRisk} at-risk project{stats.atRisk !== 1 ? 's' : ''}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {stats.onTrack > 0 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 cursor-default">
                          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                          <span className="text-xs text-emerald-400 font-medium">{stats.onTrack}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{stats.onTrack} on-track project{stats.onTrack !== 1 ? 's' : ''}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            )}

            {/* Zoom Controls */}
            <div className="flex items-center gap-1 border border-[#1a1a1a] rounded-md bg-[#0d0d0e] p-0.5">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={zoomOut}
                      disabled={zoomIndex === MIN_ZOOM}
                      className="h-6 w-6 p-0 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1a1a] disabled:opacity-30"
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Zoom out</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={resetZoom}
                      className="h-6 px-2 text-[10px] text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1a1a] font-mono min-w-[40px]"
                    >
                      {zoomPercentage}%
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Reset zoom</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={zoomIn}
                      disabled={zoomIndex === MAX_ZOOM}
                      className="h-6 w-6 p-0 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1a1a] disabled:opacity-30"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Zoom in</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Today Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={goToToday}
              className="h-7 px-2 text-xs text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1a1a]"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Today
            </Button>

            {/* Filter */}
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
        </div>

        {/* Keyboard shortcuts hint */}
        <div className="px-4 pb-2 flex items-center gap-4 text-[10px] text-[#555]">
          <span>Ctrl/Cmd + Scroll to zoom</span>
          <span>Drag to pan</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#8b949e]" />
          </div>
        ) : !ganttData || ganttData.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-[#8b949e]">
            <div className="text-center">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 text-[#666]" />
              <p className="text-base">No projects found</p>
              <p className="text-sm text-[#666] mt-1">Create a project to see it on the timeline</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/${currentWorkspace?.slug || workspaceId}/projects`)}
                className="mt-4 text-blue-400 hover:text-blue-300"
              >
                Go to Projects
              </Button>
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
            {/* Project Names Column */}
            <div className="w-72 flex-shrink-0 border-r border-[#1a1a1a] bg-[#0a0a0b] flex flex-col">
              {/* Header */}
              <div className="h-[52px] border-b border-[#1a1a1a] flex items-end px-3 pb-2 flex-shrink-0">
                <span className="text-xs font-medium text-[#8b949e]">
                  {filteredProjects.length} Project{filteredProjects.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Project list */}
              <div
                ref={projectListRef}
                className="flex-1 overflow-y-auto overflow-x-hidden"
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
                        "h-14 flex items-center px-3 border-b border-[#1a1a1a] hover:bg-[#161616] transition-colors cursor-pointer",
                        !project.hasRealDates && "opacity-60"
                      )}
                      onClick={() => router.push(`/${currentWorkspace?.slug || workspaceId}/projects/${project.slug}`)}
                    >
                      <div
                        className="w-3 h-3 rounded-sm mr-2 flex-shrink-0"
                        style={{ backgroundColor: project.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-[#e6edf3] truncate">{project.name}</span>
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
                                  <p className="text-xs text-[#8b949e]">No issues with dates assigned</p>
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
                            <span className="text-xs text-red-400">{project.overdueIssues} overdue</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Timeline Area */}
            <div ref={timelineAreaRef} className="flex-1 flex flex-col overflow-hidden">
              {/* Fixed timeline headers - synced with horizontal scroll */}
              <div
                ref={headerRef}
                className="flex-shrink-0 bg-[#0a0a0b] z-10 overflow-hidden"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {/* Month headers */}
                <div className="h-6 flex border-b border-[#1a1a1a]">
                  <div style={{ width: totalWidth, display: 'flex' }}>
                    {monthGroups.map((group, idx) => (
                      <div
                        key={idx}
                        className="flex-shrink-0 border-r border-[#1a1a1a] flex items-center justify-center"
                        style={{ width: group.days.length * dayWidth }}
                      >
                        <span className="text-[10px] font-medium text-[#8b949e] truncate px-1">
                          {format(group.month, dayWidth >= 24 ? 'MMMM yyyy' : 'MMM yy')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Day headers */}
                <div className="h-6 flex border-b border-[#1a1a1a]">
                  <div style={{ width: totalWidth, display: 'flex' }}>
                    {visibleDates.map((day, idx) => {
                      const isCurrentDay = isToday(day);
                      const weekend = isWeekend(day);

                      return (
                        <div
                          key={idx}
                          className={cn(
                            "flex-shrink-0 flex items-center justify-center border-r border-[#1a1a1a]/50",
                            isCurrentDay && "bg-blue-500/20",
                            weekend && !isCurrentDay && "bg-[#1a1a1a]/30"
                          )}
                          style={{ width: dayWidth }}
                        >
                          {dayWidth >= 16 && (
                            <span className={cn(
                              "text-[9px]",
                              isCurrentDay ? "text-blue-400 font-bold" : weekend ? "text-[#444]" : "text-[#555]"
                            )}>
                              {format(day, 'd')}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Scrollable timeline content */}
              <div
                ref={containerRef}
                className={cn(
                  "flex-1 overflow-auto",
                  isDragging ? "cursor-grabbing" : "cursor-grab"
                )}
                onScroll={handleTimelineScroll}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <div
                  ref={timelineRef}
                  style={{ width: totalWidth, minHeight: '100%' }}
                >
                  <div className="relative" style={{ height: filteredProjects.length * 56 }}>
                    {/* Today line */}
                    {todayIndex >= 0 && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-blue-500 z-20 pointer-events-none"
                        style={{ left: todayIndex * dayWidth + dayWidth / 2 }}
                      >
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-blue-500" />
                      </div>
                    )}

                    {/* Grid lines */}
                    <div className="absolute inset-0 flex pointer-events-none">
                      {visibleDates.map((day, idx) => {
                        const isCurrentDay = isToday(day);
                        const weekend = isWeekend(day);

                        return (
                          <div
                            key={idx}
                            className={cn(
                              "flex-shrink-0 border-r border-[#1a1a1a]/20",
                              isCurrentDay && "bg-blue-500/5",
                              weekend && !isCurrentDay && "bg-[#1a1a1a]/10"
                            )}
                            style={{ width: dayWidth, height: '100%' }}
                          />
                        );
                      })}
                    </div>

                    {/* Project bars */}
                    {filteredProjects.map((project, idx) => {
                      const barStyle = getBarStyle(project);
                      const health = healthConfig[project.health];

                      if (!barStyle.isVisible) return null;

                      return (
                        <div
                          key={project.id}
                          className="absolute h-14 flex items-center"
                          style={{ top: idx * 56, left: 0, right: 0 }}
                        >
                          <TooltipProvider>
                            <Tooltip delayDuration={200}>
                              <TooltipTrigger asChild>
                                <div
                                  data-bar
                                  className={cn(
                                    "absolute h-8 rounded-md cursor-pointer transition-all hover:brightness-110 hover:scale-y-105 overflow-hidden select-none",
                                    !project.hasRealDates && "opacity-50 border border-dashed border-[#666]"
                                  )}
                                  style={{
                                    left: barStyle.left,
                                    width: barStyle.width,
                                    backgroundColor: project.hasRealDates ? project.color : 'transparent',
                                  }}
                                  onClick={() => router.push(`/${currentWorkspace?.slug || workspaceId}/projects/${project.slug}`)}
                                >
                                  {/* Progress fill */}
                                  {project.hasRealDates && project.progress > 0 && project.progress < 100 && (
                                    <div
                                      className="absolute inset-0 bg-black/30"
                                      style={{ left: `${project.progress}%`, width: `${100 - project.progress}%` }}
                                    />
                                  )}

                                  {/* Bar content */}
                                  <div className="relative h-full flex items-center justify-between px-2">
                                    {barStyle.width > 80 && (
                                      <span className="text-xs text-white font-medium truncate">
                                        {project.name}
                                      </span>
                                    )}
                                    {barStyle.width > 40 && project.hasRealDates && (
                                      <span className="text-[10px] text-white/80 ml-auto">
                                        {project.progress}%
                                      </span>
                                    )}
                                  </div>

                                  {/* Health indicator */}
                                  {project.health === 'overdue' && (
                                    <div className="absolute right-0 top-0 bottom-0 w-1 bg-red-500" />
                                  )}
                                  {project.health === 'at_risk' && (
                                    <div className="absolute right-0 top-0 bottom-0 w-1 bg-amber-500" />
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs bg-[#1a1a1a] border-[#333] p-3">
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: project.color }} />
                                    <span className="font-medium text-white">{project.name}</span>
                                  </div>

                                  {project.hasRealDates ? (
                                    <>
                                      <div className="flex items-center gap-2">
                                        <span className={cn("text-xs px-1.5 py-0.5 rounded", health.bgColor, health.color)}>
                                          {health.label}
                                        </span>
                                        <span className="text-xs text-[#8b949e]">{project.progress}% complete</span>
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
                                          <span className="text-[#e6edf3]">{project.completedIssues} of {project.issueCount} completed</span>
                                        </div>
                                        {project.overdueIssues > 0 && (
                                          <div className="flex justify-between text-red-400">
                                            <span>Overdue:</span>
                                            <span>{project.overdueIssues} issue{project.overdueIssues !== 1 ? 's' : ''}</span>
                                          </div>
                                        )}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="text-xs text-[#666]">
                                      <div className="flex items-center gap-1.5">
                                        <Info className="h-3 w-3" />
                                        <span>No timeline data</span>
                                      </div>
                                      <p className="text-[#555] mt-1">Add dates to issues to see timeline</p>
                                    </div>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
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

      {/* Footer */}
      <div className="flex-shrink-0 px-4 py-2 border-t border-[#1a1a1a] flex items-center justify-between text-xs bg-[#0a0a0b]">
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
          <span>Timeline derived from issue dates</span>
        </div>
      </div>
    </div>
  );
}
