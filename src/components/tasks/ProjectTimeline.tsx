"use client";

import React, { useState, useEffect, useRef } from "react";
import { format, differenceInDays, addDays, isSameMonth, subDays, parseISO, isValid, isAfter, isBefore, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";
import { ArrowLeft, Calendar, Plus, Star } from "lucide-react";
import { 
  TimelineHeader, 
  TimelineSection, 
  TimelineEmpty, 
  TimelineControls 
} from "@/components/timeline";

interface TimelineItem {
  id: string;
  title: string;
  startDate?: string | Date | null;
  dueDate?: string | Date | null;
  type: 'milestone' | 'epic' | 'story';
  status: string;
  color?: string;
  progress?: number;
}

interface ProjectTimelineProps {
  milestones: any[];
  epics: any[];
  stories: any[];
  onCreateMilestone: () => void;
  onCreateEpic: () => void;
  onCreateStory: () => void;
}

export function ProjectTimeline({
  milestones,
  epics,
  stories,
  onCreateMilestone,
  onCreateEpic,
  onCreateStory,
}: ProjectTimelineProps) {
  const now = new Date();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(40); // 0 = very zoomed out, 100 = very zoomed in
  const [timelineStart, setTimelineStart] = useState<Date>(subDays(now, 15));
  const [timelineEnd, setTimelineEnd] = useState<Date>(addDays(now, 30));
  const [needsScroll, setNeedsScroll] = useState(true); // Set to true initially
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    milestone: false,
    epic: false,
    story: false
  });

  // Set initial scroll position when component mounts
  useEffect(() => {
    setNeedsScroll(true);
  }, []);

  // Format data for timeline
  const timelineItems: TimelineItem[] = React.useMemo(() => {
    const items: TimelineItem[] = [];

    // Add milestones to timeline with validation
    milestones.forEach(milestone => {
      const startDate = milestone.startDate ? new Date(milestone.startDate) : null;
      const dueDate = milestone.dueDate ? new Date(milestone.dueDate) : null;
      
      if (startDate || dueDate) {
        items.push({
          id: milestone.id,
          title: milestone.title,
          startDate: startDate,
          dueDate: dueDate,
          type: 'milestone',
          status: milestone.status,
          color: milestone.color || '#6366F1'
        });
      }
    });

    // Add epics to timeline with validation
    epics.forEach(epic => {
      const startDate = epic.startDate ? new Date(epic.startDate) : null;
      const dueDate = epic.dueDate ? new Date(epic.dueDate) : null;
      
      if (startDate || dueDate) {
        items.push({
          id: epic.id,
          title: epic.title,
          startDate: startDate,
          dueDate: dueDate,
          type: 'epic',
          status: epic.status,
          color: epic.color || '#8B5CF6',
          progress: epic.progress
        });
      }
    });

    // Add stories to timeline with validation
    stories.forEach(story => {
      const startDate = story.startDate ? new Date(story.startDate) : 
                       story.createdAt ? new Date(story.createdAt) : null;
      const dueDate = story.dueDate ? new Date(story.dueDate) : null;
      
      if (startDate || dueDate) {
        items.push({
          id: story.id,
          title: story.title,
          startDate: startDate,
          dueDate: dueDate,
          type: 'story',
          status: story.status,
          color: story.color || '#3B82F6'
        });
      }
    });

    return items;
  }, [milestones, epics, stories]);

  // Group items by type for sectioned display
  const groupedItems = React.useMemo(() => {
    const grouped: Record<string, TimelineItem[]> = {
      milestone: [],
      epic: [],
      story: []
    };
    
    timelineItems.forEach(item => {
      grouped[item.type].push(item);
    });
    
    return grouped;
  }, [timelineItems]);

  // Determine optimal timeline view based on items
  useEffect(() => {
    if (timelineItems.length === 0) {
      // Default view around today if no items
      setTimelineStart(subDays(now, 15));
      setTimelineEnd(addDays(now, 30));
      return;
    }

    let earliest: Date | null = null;
    let latest: Date | null = null;

    timelineItems.forEach(item => {
      // Process start date
      if (item.startDate && isValid(typeof item.startDate === 'string' ? parseISO(item.startDate) : item.startDate)) {
        const dateValue = typeof item.startDate === 'string' ? parseISO(item.startDate) : item.startDate;
        if (!earliest || isBefore(dateValue, earliest)) {
          earliest = dateValue;
        }
      }

      // Process end date
      if (item.dueDate && isValid(typeof item.dueDate === 'string' ? parseISO(item.dueDate) : item.dueDate)) {
        const dateValue = typeof item.dueDate === 'string' ? parseISO(item.dueDate) : item.dueDate;
        if (!latest || isAfter(dateValue, latest)) {
          latest = dateValue;
        }
      }
    });

    // Set timeline range with padding and ensure today is visible
    const start = earliest ? 
      isBefore(earliest, now) ? 
        subDays(earliest, 5) : 
        subDays(now, 15) :
      subDays(now, 15);
    
    const end = latest ? 
      isAfter(latest, now) ? 
        addDays(latest, 5) : 
        addDays(now, 15) :
      addDays(now, 30);
    
    setTimelineStart(start);
    setTimelineEnd(end);
    setNeedsScroll(true);
  }, [timelineItems]);

  // Scroll to today when needed
  useEffect(() => {
    if (needsScroll && scrollContainerRef.current) {
      // Center on the timeline regardless if we have items or not
      setTimeout(() => {
        if (scrollContainerRef.current) {
          const today = new Date();
          const daysSinceStart = differenceInDays(today, timelineStart);
          const dayWidth = calculateDayWidth();
          const offset = daysSinceStart * dayWidth;
          
          // Scroll to show today in the center
          const containerWidth = scrollContainerRef.current.clientWidth;
          scrollContainerRef.current.scrollLeft = Math.max(0, offset - containerWidth / 2 + 150); // Add 150px for the left column
          
          setNeedsScroll(false);
        }
      }, 100); // Small delay to ensure the DOM is ready
    }
  }, [needsScroll, timelineStart]);

  // Calculate day width based on zoom level
  const calculateDayWidth = () => {
    // Min 30px, max 140px per day
    return 30 + ((zoomLevel / 100) * 110);
  };

  const dayWidth = calculateDayWidth();
  const totalDays = differenceInDays(timelineEnd, timelineStart) + 1;
  const timelineWidth = totalDays * dayWidth;

  // Navigation functions
  const shiftLeft = () => {
    const days = Math.max(7, Math.floor(totalDays * 0.3));
    setTimelineStart(subDays(timelineStart, days));
    setTimelineEnd(subDays(timelineEnd, days));
  };

  const shiftRight = () => {
    const days = Math.max(7, Math.floor(totalDays * 0.3));
    setTimelineStart(addDays(timelineStart, days));
    setTimelineEnd(addDays(timelineEnd, days));
  };

  const zoomIn = () => {
    setZoomLevel(Math.min(zoomLevel + 10, 100));
  };

  const zoomOut = () => {
    setZoomLevel(Math.max(zoomLevel - 10, 0));
  };

  const handleZoomChange = (value: number[]) => {
    setZoomLevel(value[0]);
  };

  const resetView = () => {
    setTimelineStart(subDays(now, 15));
    setTimelineEnd(addDays(now, 30));
    setZoomLevel(40);
    setNeedsScroll(true);
  };

  // Toggle section collapse state
  const toggleSection = (section: 'milestone' | 'epic' | 'story') => {
    setCollapsedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Calculate position of today for vertical indicator
  const getTodayPosition = () => {
    const daysSinceStart = differenceInDays(now, timelineStart);
    return daysSinceStart * dayWidth + 150; // 150px for left column
  };

  // Generate the visible days for the timeline
  const timelineDays = React.useMemo(() => {
    const days = [];
    let currentDay = new Date(timelineStart);

    while (!isAfter(currentDay, timelineEnd)) {
      days.push(new Date(currentDay));
      currentDay = addDays(currentDay, 1);
    }

    return days;
  }, [timelineStart, timelineEnd]);

  // Group timeline days by month for better display
  const groupedMonths = React.useMemo(() => {
    const months: { month: Date, days: Date[] }[] = [];
    let currentMonth: Date | null = null;
    let currentDays: Date[] = [];

    timelineDays.forEach(day => {
      if (!currentMonth || !isSameMonth(day, currentMonth)) {
        if (currentMonth && currentDays.length) {
          months.push({ month: currentMonth, days: currentDays });
        }
        currentMonth = day;
        currentDays = [day];
      } else {
        currentDays.push(day);
      }
    });

    if (currentMonth && currentDays.length) {
      months.push({ month: currentMonth, days: currentDays });
    }

    return months;
  }, [timelineDays]);

  // Style helpers for status and type
  const getTypeStyles = (type: string) => {
    switch (type) {
      case 'milestone':
        return {
          bg: 'bg-indigo-100 dark:bg-indigo-900/30',
          hover: 'hover:bg-indigo-200 dark:hover:bg-indigo-800/50',
          border: 'border-indigo-300 dark:border-indigo-700',
          icon: <Star className="h-3 w-3 text-indigo-500 dark:text-indigo-400" />,
          header: 'bg-indigo-50 dark:bg-indigo-900/20'
        };
      case 'epic':
        return {
          bg: 'bg-purple-100 dark:bg-purple-900/30',
          hover: 'hover:bg-purple-200 dark:hover:bg-purple-800/50',
          border: 'border-purple-300 dark:border-purple-700',
          icon: <Calendar className="h-3 w-3 text-purple-500 dark:text-purple-400" />,
          header: 'bg-purple-50 dark:bg-purple-900/20'
        };
      case 'story':
      default:
        return {
          bg: 'bg-blue-100 dark:bg-blue-900/30',
          hover: 'hover:bg-blue-200 dark:hover:bg-blue-800/50',
          border: 'border-blue-300 dark:border-blue-700',
          icon: null,
          header: 'bg-blue-50 dark:bg-blue-900/20'
        };
    }
  };

  const hasItems = timelineItems.length > 0;

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      {/* Timeline Controls */}
      <TimelineControls 
        timelineStart={timelineStart}
        timelineEnd={timelineEnd}
        zoomLevel={zoomLevel}
        onZoomChange={handleZoomChange}
        zoomIn={zoomIn}
        zoomOut={zoomOut}
        resetView={resetView}
        shiftLeft={shiftLeft}
        shiftRight={shiftRight}
      />

      <div className="border rounded-md shadow-sm bg-card overflow-hidden">
        {/* Month and Day Headers */}
        <TimelineHeader 
          timelineDays={timelineDays}
          totalDays={totalDays}
          dayWidth={dayWidth}
          now={now}
          groupedMonths={groupedMonths}
        />

        {/* Timeline Container */}
        <div
          ref={scrollContainerRef}
          className="overflow-auto relative"
          style={{ 
            height: hasItems ? '60vh' : '300px', 
            width: '100%'
          }}
        >
          {/* Vertical line for today */}
          <div 
            className="absolute top-0 bottom-0 w-px bg-primary/40 z-10 pointer-events-none" 
            style={{ 
              left: `${getTodayPosition()}px`,
              height: '100%'
            }}
          />
          
          {hasItems ? (
            <div className="relative" style={{ minHeight: '100%', position: 'relative' }}>
              {/* Section: Milestones */}
              <TimelineSection 
                title="Milestones"
                type="milestone"
                items={groupedItems.milestone}
                isCollapsed={collapsedSections.milestone}
                toggleSection={toggleSection}
                totalDays={totalDays}
                dayWidth={dayWidth}
                timelineStart={timelineStart}
                getTypeStyles={getTypeStyles}
              />

              {/* Section: Epics */}
              <TimelineSection 
                title="Epics"
                type="epic"
                items={groupedItems.epic}
                isCollapsed={collapsedSections.epic}
                toggleSection={toggleSection}
                totalDays={totalDays}
                dayWidth={dayWidth}
                timelineStart={timelineStart}
                getTypeStyles={getTypeStyles}
              />

              {/* Section: Stories */}
              <TimelineSection 
                title="Stories"
                type="story"
                items={groupedItems.story}
                isCollapsed={collapsedSections.story}
                toggleSection={toggleSection}
                totalDays={totalDays}
                dayWidth={dayWidth}
                timelineStart={timelineStart}
                getTypeStyles={getTypeStyles}
              />
            </div>
          ) : (
            // Empty state
            <TimelineEmpty 
              onCreateMilestone={onCreateMilestone}
              onCreateEpic={onCreateEpic}
              onCreateStory={onCreateStory}
            />
          )}
        </div>
      </div>
    </div>
  );
} 