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
  return (
    <div className="sticky top-0 z-20 bg-collab-900 border-b border-collab-700 shadow-sm">
      {/* Month row */}
      <div 
        className="grid" 
        style={{ 
          gridTemplateColumns: `150px repeat(${totalDays}, ${dayWidth}px)`,
          width: `calc(150px + ${totalDays * dayWidth}px)`
        }}
      >
        <div className="p-2 text-center font-medium bg-collab-800 border-r border-collab-600 text-collab-400"></div>
        {groupedMonths.map(({ month, days }) => (
          <div
            key={month.toISOString()}
            className="border-r border-collab-600 font-medium text-center text-xs py-2 bg-collab-900 text-collab-50"
            style={{ gridColumn: `span ${days.length}` }}
          >
            {format(month, "MMMM yyyy")}
          </div>
        ))}
      </div>

      {/* Day row */}
      <div 
        className="grid" 
        style={{ 
          gridTemplateColumns: `150px repeat(${totalDays}, ${dayWidth}px)`,
          width: `calc(150px + ${totalDays * dayWidth}px)`
        }}
      >
        <div className="p-2 font-medium text-center border-r border-collab-600 bg-collab-800 text-collab-50 text-sm">
          Item
        </div>
        {timelineDays.map((day, index) => (
          <div
            key={index}
            className={cn(
              "py-1.5 px-0.5 text-center text-[10px] border-r border-collab-600 truncate transition-colors",
              day.getDay() === 0 || day.getDay() === 6 
                ? "bg-collab-900" 
                : "bg-collab-900",
              isSameDay(now, day) 
                ? "bg-blue-600/20 border-blue-600/40" 
                : ""
            )}
          >
            <div className={cn(
              "font-medium",
              isSameDay(now, day) ? "text-blue-600" : "text-collab-50"
            )}>
              {format(day, "d")}
            </div>
            <div className={cn(
              "text-xs",
              isSameDay(now, day) ? "text-blue-600/80" : "text-collab-400"
            )}>
              {format(day, "EEE")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 