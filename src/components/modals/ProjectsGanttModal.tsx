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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, differenceInDays, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, startOfWeek, endOfWeek, addMonths, subMonths } from 'date-fns';

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
}

interface ProjectsGanttModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
}

export default function ProjectsGanttModal({
  isOpen,
  onClose,
  workspaceId
}: ProjectsGanttModalProps) {
  const [viewDate, setViewDate] = useState(new Date());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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

  // Calculate bar position and width for a project
  const getBarStyle = (project: ProjectGanttData) => {
    const projectStart = new Date(project.startDate);
    const projectEnd = new Date(project.dueDate);

    const dayWidth = 32; // pixels per day
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
      const dayWidth = 32;
      const todayOffset = differenceInDays(new Date(), timelineRange.start);
      const scrollPosition = Math.max(0, (todayOffset * dayWidth) - 200);

      setTimeout(() => {
        scrollContainerRef.current?.scrollTo({ left: scrollPosition, behavior: 'smooth' });
      }, 100);
    }
  }, [isOpen, timelineRange.start]);

  const dayWidth = 32;
  const totalWidth = timelineDays.length * dayWidth;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[85vh] p-0 bg-[#0e0e0e] border-[#1a1a1a] overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Projects Gantt Chart</DialogTitle>
        </DialogHeader>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-sm flex items-center justify-center bg-blue-500/20">
              <BarChart3 className="h-3 w-3 text-blue-400" />
            </div>
            <h2 className="text-sm font-medium text-[#e6edf3]">Projects Timeline</h2>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center gap-2">
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

        {/* Content */}
        <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(85vh - 60px)' }}>
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
          ) : (
            <div className="flex flex-1 overflow-hidden">
              {/* Project Names Column (Fixed) */}
              <div className="w-64 flex-shrink-0 border-r border-[#1a1a1a] bg-[#0e0e0e]">
                {/* Header spacer */}
                <div className="h-[72px] border-b border-[#1a1a1a] flex items-end px-3 pb-2">
                  <span className="text-xs font-medium text-[#8b949e]">Projects</span>
                </div>

                {/* Project list */}
                <div className="overflow-y-auto" style={{ height: 'calc(100% - 72px)' }}>
                  {ganttData.map((project) => (
                    <div
                      key={project.id}
                      className="h-12 flex items-center px-3 border-b border-[#1a1a1a] hover:bg-[#161616] transition-colors"
                    >
                      <div
                        className="w-3 h-3 rounded-sm mr-2 flex-shrink-0"
                        style={{ backgroundColor: project.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-[#e6edf3] truncate block">
                          {project.name}
                        </span>
                        <span className="text-xs text-[#666]">
                          {project.issueCount} issues
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Timeline Area (Scrollable) */}
              <div className="flex-1 overflow-hidden">
                <div
                  ref={scrollContainerRef}
                  className="overflow-x-auto overflow-y-auto h-full"
                >
                  <div style={{ width: totalWidth, minWidth: '100%' }}>
                    {/* Month headers */}
                    <div className="h-8 flex border-b border-[#1a1a1a] sticky top-0 bg-[#0e0e0e] z-10">
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

                    {/* Day headers */}
                    <div className="h-8 flex border-b border-[#1a1a1a] sticky top-8 bg-[#0e0e0e] z-10">
                      {timelineDays.map((day, idx) => (
                        <div
                          key={idx}
                          className={cn(
                            "flex-shrink-0 flex items-center justify-center border-r border-[#1a1a1a]",
                            isToday(day) && "bg-blue-500/10"
                          )}
                          style={{ width: dayWidth }}
                        >
                          <span className={cn(
                            "text-[10px]",
                            isToday(day) ? "text-blue-400 font-medium" : "text-[#666]"
                          )}>
                            {format(day, 'd')}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Today line */}
                    <div className="relative" style={{ height: ganttData.length * 48 }}>
                      {(() => {
                        const todayOffset = differenceInDays(new Date(), timelineRange.start);
                        if (todayOffset >= 0 && todayOffset < timelineDays.length) {
                          return (
                            <div
                              className="absolute top-0 bottom-0 w-px bg-blue-500 z-20"
                              style={{ left: todayOffset * dayWidth + dayWidth / 2 }}
                            />
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
                              "flex-shrink-0 border-r border-[#1a1a1a]/50",
                              isToday(day) && "bg-blue-500/5"
                            )}
                            style={{ width: dayWidth, height: '100%' }}
                          />
                        ))}
                      </div>

                      {/* Project bars */}
                      {ganttData.map((project, idx) => {
                        const barStyle = getBarStyle(project);

                        return (
                          <div
                            key={project.id}
                            className="absolute h-12 flex items-center border-b border-[#1a1a1a]"
                            style={{
                              top: idx * 48,
                              left: 0,
                              right: 0
                            }}
                          >
                            {barStyle.isVisible && (
                              <div
                                className="absolute h-7 rounded-md flex items-center px-2 cursor-pointer hover:opacity-90 transition-opacity group"
                                style={{
                                  left: barStyle.left,
                                  width: Math.max(barStyle.width, 60),
                                  backgroundColor: project.color,
                                }}
                                title={`${project.name}: ${format(new Date(project.startDate), 'MMM d')} - ${format(new Date(project.dueDate), 'MMM d, yyyy')}`}
                              >
                                <span className="text-xs text-white font-medium truncate">
                                  {barStyle.width > 80 ? project.name : ''}
                                </span>

                                {/* Tooltip */}
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[#1a1a1a] border border-[#333] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-30">
                                  <div className="text-sm font-medium text-white mb-1">{project.name}</div>
                                  <div className="text-xs text-[#8b949e]">
                                    {format(new Date(project.startDate), 'MMM d, yyyy')} - {format(new Date(project.dueDate), 'MMM d, yyyy')}
                                  </div>
                                  <div className="text-xs text-[#666] mt-1">
                                    {differenceInDays(new Date(project.dueDate), new Date(project.startDate))} days
                                  </div>
                                </div>
                              </div>
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
        <div className="px-4 py-2 border-t border-[#1a1a1a] flex items-center justify-between text-xs text-[#666]">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-blue-500" />
              <span>Today</span>
            </div>
            <span>Timeline based on issue start/due dates</span>
          </div>
          <span>{ganttData?.length || 0} projects</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
