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
    <div className="sticky top-0 z-20 bg-card border-b shadow-sm">
      {/* Month row */}
      <div 
        className="grid" 
        style={{ 
          gridTemplateColumns: `150px repeat(${totalDays}, ${dayWidth}px)`,
          width: `calc(150px + ${totalDays * dayWidth}px)`
        }}
      >
        <div className="p-2 text-center font-medium bg-muted/50 border-r"></div>
        {groupedMonths.map(({ month, days }) => (
          <div
            key={month.toISOString()}
            className="border-r font-medium text-center text-xs py-1 bg-muted/30"
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
        <div className="p-2 font-medium text-center border-r bg-muted">Item</div>
        {timelineDays.map((day, index) => (
          <div
            key={index}
            className={cn(
              "py-1 px-0.5 text-center text-[10px] border-r truncate transition-colors",
              day.getDay() === 0 || day.getDay() === 6 ? "bg-muted/40" : "bg-card",
              isSameDay(now, day) ? "bg-primary/10 font-medium" : ""
            )}
          >
            <div className="font-medium">{format(day, "d")}</div>
            <div className="text-muted-foreground">{format(day, "EEE")}</div>
          </div>
        ))}
      </div>
    </div>
  );
} 