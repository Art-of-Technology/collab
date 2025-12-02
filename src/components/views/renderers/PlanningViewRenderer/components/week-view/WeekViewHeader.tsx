"use client";

import { cn } from '@/lib/utils';
import { format, isToday, isFuture, startOfDay } from 'date-fns';

interface WeekViewHeaderProps {
  days: Date[];
}

export function WeekViewHeader({ days }: WeekViewHeaderProps) {
  return (
    <thead className="sticky top-0 z-20">
      <tr>
        <th 
          className="min-w-[224px] w-[224px] sticky left-0 z-30 bg-[#09090b] border-b border-r border-[#27272a] px-3 py-3 text-left"
        >
          <span className="text-[11px] font-medium text-[#52525b] uppercase tracking-wider">
            Team Member
          </span>
        </th>
        {days.map((day) => {
          const isTodayDay = isToday(day);
          const isFutureDay = isFuture(startOfDay(day));
          return (
            <th 
              key={format(day, 'yyyy-MM-dd')} 
              className={cn(
                "min-w-[280px] w-[280px] border-b border-r border-[#27272a] px-3 py-2 text-center font-normal",
                isTodayDay ? "bg-[#1a1a1a]" : "bg-[#09090b]",
                isFutureDay && "opacity-50"
              )}
            >
              <div className="flex items-center justify-center gap-2">
                <span className={cn(
                  "text-[11px] font-medium uppercase",
                  isTodayDay ? "text-blue-400" : "text-[#52525b]"
                )}>
                  {format(day, 'EEE')}
                </span>
                <span className={cn(
                  "text-[15px] font-semibold",
                  isTodayDay ? "text-[#fafafa]" : "text-[#a1a1aa]"
                )}>
                  {format(day, 'd')}
                </span>
                <span className={cn(
                  "text-[11px]",
                  isTodayDay ? "text-blue-400" : "text-[#52525b]"
                )}>
                  {format(day, 'MMM')}
                </span>
                {isTodayDay && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-medium">
                    TODAY
                  </span>
                )}
              </div>
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

