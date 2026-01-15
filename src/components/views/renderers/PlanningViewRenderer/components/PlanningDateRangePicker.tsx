"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CalendarRange
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, subDays, subWeeks, startOfDay, endOfDay, differenceInDays, addDays } from 'date-fns';
import { cn } from '@/lib/utils';
import type { DateRange, ViewMode } from '../types';

interface PlanningDateRangePickerProps {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

// Day view presets include previous day for yesterday/today comparison
const getDayViewPresets = () => [
  { label: 'Today', getValue: () => ({ startDate: startOfDay(subDays(new Date(), 1)), endDate: endOfDay(new Date()) }) }, // Yesterday + Today
  { label: 'Yesterday', getValue: () => ({ startDate: startOfDay(subDays(new Date(), 2)), endDate: endOfDay(subDays(new Date(), 1)) }) }, // Day before + Yesterday
  { label: 'Last 3 Days', getValue: () => ({ startDate: startOfDay(subDays(new Date(), 2)), endDate: endOfDay(new Date()) }) },
  { label: 'Last 7 Days', getValue: () => ({ startDate: startOfDay(subDays(new Date(), 6)), endDate: endOfDay(new Date()) }) },
];

// Week view presets (max 7 days)
const getWeekPresets = () => [
  { label: 'This Week', getValue: () => ({ startDate: startOfWeek(new Date(), { weekStartsOn: 1 }), endDate: endOfWeek(new Date(), { weekStartsOn: 1 }) }) },
  { label: 'Last Week', getValue: () => ({ startDate: startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 }), endDate: endOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 }) }) },
  { label: 'Last 7 Days', getValue: () => ({ startDate: startOfDay(subDays(new Date(), 6)), endDate: endOfDay(new Date()) }) },
];

// Activity view presets (can be longer)
const getActivityPresets = () => [
  { label: 'This Week', getValue: () => ({ startDate: startOfWeek(new Date(), { weekStartsOn: 1 }), endDate: endOfWeek(new Date(), { weekStartsOn: 1 }) }) },
  { label: 'Last Week', getValue: () => ({ startDate: startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 }), endDate: endOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 }) }) },
  { label: 'Last 7 Days', getValue: () => ({ startDate: startOfDay(subDays(new Date(), 6)), endDate: endOfDay(new Date()) }) },
  { label: 'Last 14 Days', getValue: () => ({ startDate: startOfDay(subDays(new Date(), 13)), endDate: endOfDay(new Date()) }) },
];

export function PlanningDateRangePicker({
  dateRange,
  onDateRangeChange,
  viewMode,
  onViewModeChange,
}: PlanningDateRangePickerProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectingRange, setSelectingRange] = useState<'start' | 'end'>('start');

  // Get presets based on view mode
  const presets = viewMode === 'day' 
    ? getDayViewPresets() 
    : viewMode === 'week' 
      ? getWeekPresets() 
      : getActivityPresets();

  // Calculate step size for navigation
  // Day view: move by 1 day so previous "today" becomes current "yesterday"
  // Other views: move by full range
  const getNavigationStep = () => {
    if (viewMode === 'day') {
      return 1; // Move by 1 day for day view
    }
    // For other views, move by full range
    const startDay = startOfDay(dateRange.startDate);
    const endDay = startOfDay(dateRange.endDate);
    const diffMs = endDay.getTime() - startDay.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
  };

  const navigatePrevious = () => {
    const step = getNavigationStep();
    
    onDateRangeChange({
      startDate: startOfDay(subDays(dateRange.startDate, step)),
      endDate: endOfDay(subDays(dateRange.endDate, step)),
    });
  };

  const navigateNext = () => {
    const step = getNavigationStep();
    
    const newEndDate = endOfDay(new Date(dateRange.endDate.getTime() + step * 24 * 60 * 60 * 1000));
    // Don't allow navigating past today
    if (newEndDate > new Date()) {
      return;
    }
    
    onDateRangeChange({
      startDate: startOfDay(new Date(dateRange.startDate.getTime() + step * 24 * 60 * 60 * 1000)),
      endDate: newEndDate,
    });
  };

  const isToday = () => {
    const today = new Date();
    const yesterday = subDays(today, 1);
    
    // For day view, "today" means (yesterday, today) range
    if (viewMode === 'day') {
      return (
        format(dateRange.startDate, 'yyyy-MM-dd') === format(yesterday, 'yyyy-MM-dd') &&
        format(dateRange.endDate, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
      );
    }
    
    return (
      format(dateRange.startDate, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd') &&
      format(dateRange.endDate, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
    );
  };

  const isSingleDay = () => {
    return format(dateRange.startDate, 'yyyy-MM-dd') === format(dateRange.endDate, 'yyyy-MM-dd');
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    
    // For day view, single date selection = (selected date - 1, selected date)
    if (viewMode === 'day') {
      onDateRangeChange({
        startDate: startOfDay(subDays(date, 1)),
        endDate: endOfDay(date),
      });
      setCalendarOpen(false);
      return;
    }
    
    // For week view, enforce max 7 days
    const maxDays = viewMode === 'week' ? 7 : 30; // 7 days for week view, 30 for activity
    
    if (selectingRange === 'start') {
      let newEndDate = dateRange.endDate;
      // If new start date would make range too long, adjust end date
      if (differenceInDays(dateRange.endDate, date) >= maxDays) {
        newEndDate = endOfDay(addDays(date, maxDays - 1));
      }
      // If start is after end, set end to start + maxDays or original end
      if (date > dateRange.endDate) {
        newEndDate = endOfDay(date);
      }
      
      onDateRangeChange({
        startDate: startOfDay(date),
        endDate: newEndDate,
      });
      setSelectingRange('end');
    } else {
      let newStartDate = dateRange.startDate;
      // If new end date would make range too long, adjust start date
      if (differenceInDays(date, dateRange.startDate) >= maxDays) {
        newStartDate = startOfDay(subDays(date, maxDays - 1));
      }
      // If end is before start, set start to end - maxDays or original start
      if (date < dateRange.startDate) {
        newStartDate = startOfDay(date);
      }
      
      onDateRangeChange({
        startDate: newStartDate,
        endDate: endOfDay(date),
      });
      setSelectingRange('start');
      setCalendarOpen(false);
    }
  };

  const formatDateRangeLabel = () => {
    // For day view showing (yesterday, today), display as "Today" if it's the current today
    if (viewMode === 'day' && isToday()) {
      return 'Today';
    }
    
    if (isSingleDay()) {
      if (isToday()) return 'Today';
      return format(dateRange.startDate, 'MMM d, yyyy');
    }
    
    const sameMonth = format(dateRange.startDate, 'MMM yyyy') === format(dateRange.endDate, 'MMM yyyy');
    const sameYear = format(dateRange.startDate, 'yyyy') === format(dateRange.endDate, 'yyyy');
    
    if (sameMonth) {
      return `${format(dateRange.startDate, 'MMM d')} - ${format(dateRange.endDate, 'd, yyyy')}`;
    }
    
    if (sameYear) {
      return `${format(dateRange.startDate, 'MMM d')} - ${format(dateRange.endDate, 'MMM d, yyyy')}`;
    }
    
    return `${format(dateRange.startDate, 'MMM d, yyyy')} - ${format(dateRange.endDate, 'MMM d, yyyy')}`;
  };

  const canNavigateNext = () => {
    const step = getNavigationStep();
    const newEndDate = new Date(dateRange.endDate.getTime() + step * 24 * 60 * 60 * 1000);
    return newEndDate <= new Date();
  };

  return (
    <div className="flex items-center gap-2">
      {/* View Mode Toggle */}
      <div className="flex items-center bg-[#1a1a1a] border border-[#2d2d30] rounded-md p-0.5">
        <Button
          variant="ghost"
          onClick={() => onViewModeChange('day')}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors h-auto",
            viewMode === 'day'
              ? "bg-[#2563eb] text-white"
              : "text-gray-400 hover:text-white hover:bg-[#252525]"
          )}
        >
          <CalendarIcon className="h-3 w-3" />
          Day
        </Button>
        <Button
          variant="ghost"
          onClick={() => onViewModeChange('week')}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors h-auto",
            viewMode === 'week'
              ? "bg-[#2563eb] text-white"
              : "text-gray-400 hover:text-white hover:bg-[#252525]"
          )}
        >
          <CalendarDays className="h-3 w-3" />
          Week
        </Button>
        <Button
          variant="ghost"
          onClick={() => onViewModeChange('activity')}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors h-auto",
            viewMode === 'activity'
              ? "bg-[#2563eb] text-white"
              : "text-gray-400 hover:text-white hover:bg-[#252525]"
          )}
        >
          <CalendarRange className="h-3 w-3" />
          Activity
        </Button>
      </div>

      {/* Date Navigation */}
      <div className="flex items-center bg-[#1a1a1a] border border-[#2d2d30] rounded-md">
        <Button
          variant="ghost"
          onClick={navigatePrevious}
          className="p-1.5 hover:bg-[#252525] transition-colors rounded-l-md h-auto"
          title="Previous period"
        >
          <ChevronLeft className="h-4 w-4 text-gray-400" />
        </Button>

        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-xs font-medium transition-colors h-auto",
                "text-white hover:bg-[#252525]"
              )}
            >
              <CalendarIcon className="h-3.5 w-3.5 text-[#6366f1]" />
              <span>{formatDateRangeLabel()}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto p-0 bg-[#1c1c1e] border-[#333]"
            align="center"
            sideOffset={8}
          >
            <div className="flex">
              {/* Presets */}
              <div className="border-r border-[#333] p-2 space-y-1">
                <div className="text-xs font-medium text-gray-400 px-2 py-1">Quick Select</div>
                {presets.map((preset) => (
                  <Button
                    key={preset.label}
                    variant="ghost"
                    onClick={() => {
                      const range = preset.getValue();
                      onDateRangeChange(range);
                      setCalendarOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-[#252525] rounded transition-colors h-auto justify-start"
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>

              {/* Calendar */}
              <div className="p-2">
                <div className="text-xs text-gray-400 mb-2 px-2">
                  {viewMode === 'day'
                    ? 'Select date (will include previous day)'
                    : viewMode === 'week'
                      ? `${selectingRange === 'start' ? 'Select start date' : 'Select end date'} (max 7 days)`
                      : selectingRange === 'start' ? 'Select start date' : 'Select end date'
                  }
                </div>
                <Calendar
                  mode="single"
                  selected={selectingRange === 'start' ? dateRange.startDate : dateRange.endDate}
                  onSelect={handleDateSelect}
                  disabled={(date) => date > new Date()}
                  className="bg-[#1c1c1e] text-white"
                  modifiers={{
                    range_start: dateRange.startDate,
                    range_end: dateRange.endDate,
                    in_range: (date) =>
                      date > dateRange.startDate && date < dateRange.endDate,
                  }}
                  modifiersStyles={{
                    range_start: { backgroundColor: '#2563eb', color: 'white', borderRadius: '4px 0 0 4px' },
                    range_end: { backgroundColor: '#2563eb', color: 'white', borderRadius: '0 4px 4px 0' },
                    in_range: { backgroundColor: 'rgba(37, 99, 235, 0.2)' },
                  }}
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          onClick={navigateNext}
          disabled={!canNavigateNext()}
          className={cn(
            "p-1.5 transition-colors rounded-r-md h-auto",
            canNavigateNext()
              ? "hover:bg-[#252525] text-gray-400"
              : "text-gray-600 cursor-not-allowed"
          )}
          title="Next period"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Today Button */}
      {!isToday() && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            // For day view, include yesterday for comparison
            if (viewMode === 'day') {
              onDateRangeChange({
                startDate: startOfDay(subDays(new Date(), 1)),
                endDate: endOfDay(new Date()),
              });
            } else {
              onDateRangeChange({
                startDate: startOfDay(new Date()),
                endDate: endOfDay(new Date()),
              });
            }
          }}
          className="h-7 px-2 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
        >
          Today
        </Button>
      )}
    </div>
  );
}

