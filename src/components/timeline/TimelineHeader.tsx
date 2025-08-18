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
    <div className="sticky top-0 z-20 bg-[#0e0e0e] border-b border-[#1a1a1a] shadow-sm">
      {/* Month row */}
      <div 
        className="grid" 
        style={{ 
          gridTemplateColumns: `150px repeat(${totalDays}, ${dayWidth}px)`,
          width: `calc(150px + ${totalDays * dayWidth}px)`
        }}
      >
        <div className="p-2 text-center font-medium bg-[#1a1a1a] border-r border-[#333] text-[#8b949e]"></div>
        {groupedMonths.map(({ month, days }) => (
          <div
            key={month.toISOString()}
            className="border-r border-[#333] font-medium text-center text-xs py-2 bg-[#161616] text-[#e6edf3]"
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
        <div className="p-2 font-medium text-center border-r border-[#333] bg-[#1a1a1a] text-[#e6edf3] text-sm">
          Item
        </div>
        {timelineDays.map((day, index) => (
          <div
            key={index}
            className={cn(
              "py-1.5 px-0.5 text-center text-[10px] border-r border-[#333] truncate transition-colors",
              day.getDay() === 0 || day.getDay() === 6 
                ? "bg-[#161616]" 
                : "bg-[#0e0e0e]",
              isSameDay(now, day) 
                ? "bg-[#0969da]/20 border-[#0969da]/40" 
                : ""
            )}
          >
            <div className={cn(
              "font-medium",
              isSameDay(now, day) ? "text-[#0969da]" : "text-[#e6edf3]"
            )}>
              {format(day, "d")}
            </div>
            <div className={cn(
              "text-xs",
              isSameDay(now, day) ? "text-[#0969da]/80" : "text-[#8b949e]"
            )}>
              {format(day, "EEE")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 