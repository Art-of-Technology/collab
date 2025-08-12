"use client";

import React from "react";
import { format, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";

interface TimelineHeaderProps {
  timelineDays: Date[];
  totalDays: number;
  dayWidth: number;
  now: Date;
  groupedMonths: { month: Date; days: Date[] }[];
}

export function TimelineHeader({
  timelineDays,
  totalDays,
  dayWidth,
  now,
  groupedMonths,
}: TimelineHeaderProps) {
  // Responsive column width
  const getResponsiveColumnWidth = () => {
    return `clamp(80px, 15vw, 150px)`;
  };

  // Responsive day width for different screen sizes
  const getResponsiveDayWidth = () => {
    return `max(${dayWidth}px, 20px)`;
  };

  return (
    <div className="sticky top-0 z-20 bg-card border-b shadow-sm overflow-x-auto">
      {/* Month row */}
      <div 
        className="grid min-w-fit" 
        style={{ 
          gridTemplateColumns: `${getResponsiveColumnWidth()} repeat(${totalDays}, ${getResponsiveDayWidth()})`,
          minWidth: `calc(${getResponsiveColumnWidth()} + ${totalDays * Math.max(dayWidth, 20)}px)`
        }}
      >
        <div className="p-1 sm:p-2 text-center font-medium bg-muted/50 border-r text-xs sm:text-sm"></div>
        {groupedMonths.map(({ month, days }) => (
          <div
            key={month.toISOString()}
            className="border-r font-medium text-center text-[10px] sm:text-xs py-1 bg-muted/30 px-1"
            style={{ gridColumn: `span ${days.length}` }}
          >
            <span className="hidden sm:inline">{format(month, "MMMM yyyy")}</span>
            <span className="sm:hidden">{format(month, "MMM yy")}</span>
          </div>
        ))}
      </div>

      {/* Day row */}
      <div 
        className="grid min-w-fit" 
        style={{ 
          gridTemplateColumns: `${getResponsiveColumnWidth()} repeat(${totalDays}, ${getResponsiveDayWidth()})`,
          minWidth: `calc(${getResponsiveColumnWidth()} + ${totalDays * Math.max(dayWidth, 20)}px)`
        }}
      >
        <div className="p-1 sm:p-2 font-medium text-center border-r bg-muted text-xs sm:text-sm">
          <span className="hidden sm:inline">Item</span>
          <span className="sm:hidden">Items</span>
        </div>
        {timelineDays.map((day, index) => (
          <div
            key={index}
            className={cn(
              "py-0.5 sm:py-1 px-0.5 text-center text-[8px] sm:text-[10px] border-r truncate transition-colors",
              day.getDay() === 0 || day.getDay() === 6 ? "bg-muted/40" : "bg-card",
              isSameDay(now, day) ? "bg-primary/10 font-medium" : ""
            )}
          >
            <div className="font-medium text-[10px] sm:text-xs">{format(day, "d")}</div>
            <div className="text-muted-foreground text-[8px] sm:text-[10px] leading-tight">
              <span className="hidden sm:inline">{format(day, "EEE")}</span>
              <span className="sm:hidden">{format(day, "E")}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 