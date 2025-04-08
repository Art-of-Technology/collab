"use client";

import React from "react";
import { format, differenceInDays, parseISO } from "date-fns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface TimelineItemProps {
  item: {
    id: string;
    title: string;
    startDate?: string | Date | null;
    dueDate?: string | Date | null;
    type: 'milestone' | 'epic' | 'story';
    status: string;
    color?: string;
    progress?: number;
  };
  indexInGroup: number;
  typeStyles: {
    bg: string;
    hover: string;
    border: string;
    icon: React.ReactNode;
    header: string;
  };
  timelineStart: Date;
  dayWidth: number;
  totalDays: number;
}

export function TimelineItem({
  item,
  indexInGroup,
  typeStyles,
  timelineStart,
  dayWidth,
  totalDays
}: TimelineItemProps) {
  const getItemPosition = (startDate: Date | string | null | undefined, dueDate: Date | string | null | undefined) => {
    const start = startDate
      ? differenceInDays(
          typeof startDate === 'string' ? parseISO(startDate) : startDate,
          timelineStart
        )
      : 0;

    const end = dueDate
      ? differenceInDays(
          typeof dueDate === 'string' ? parseISO(dueDate) : dueDate,
          timelineStart
        ) + 1
      : start + 1;

    return { 
      start: Math.max(0, start), 
      end: Math.max(end, start + 1) 
    };
  };

  const getStatusColorValue = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'done':
        return "var(--green-500)";
      case 'in-progress':
      case 'in progress':
        return "var(--blue-500)";
      case 'blocked':
        return "var(--red-500)";
      case 'planned':
      case 'backlog':
      default:
        return "var(--gray-500)";
    }
  };

  const { start, end } = getItemPosition(item.startDate, item.dueDate);
  const isVisible = end > 0 && start < totalDays;
  
  if (!isVisible) return null;
  
  return (
    <>
      <div 
        className="p-2 text-xs font-medium border-r sticky left-0 z-10 bg-card"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "150px",
          height: "100%",
          display: "flex",
          alignItems: "center"
        }}
      >
        <div className="flex items-center gap-1.5">
          {typeStyles.icon}
          <span className="truncate">{item.title}</span>
        </div>
      </div>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                "absolute h-8 rounded-md flex items-center justify-start px-2 cursor-pointer border text-xs shadow-sm",
                typeStyles.hover,
                typeStyles.border,
              )}
              style={{
                left: `calc(150px + ${start * dayWidth}px)`,
                width: `${(end - start) * dayWidth}px`,
                top: "4px", // Centered in the row
                minWidth: '40px',
                zIndex: 5,
                backgroundColor: item.color ? `${item.color}20` : typeStyles.bg.replace("bg-", "var(--"),
                borderColor: item.color || undefined
              }}
            >
              <span className="truncate leading-tight">{item.title}</span>
              {item.progress !== undefined && (
                <div
                  className="absolute bottom-0 left-0 h-1.5 rounded-b-md transition-all duration-500"
                  style={{ 
                    width: `${item.progress}%`,
                    backgroundColor: item.color || "var(--green-500)"
                  }}
                ></div>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent className="p-0 overflow-hidden w-72">
            <div className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span 
                  className="w-3 h-3 rounded-full border"
                  style={{ 
                    backgroundColor: item.color || getStatusColorValue(item.status),
                    borderColor: item.color ? `${item.color}40` : undefined
                  }}
                ></span>
                <p className="font-medium">{item.title}</p>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{item.type.charAt(0).toUpperCase() + item.type.slice(1)}</span>
                <span>Status: {item.status}</span>
              </div>
              <div className="text-xs pt-1 border-t">
                {item.startDate && item.dueDate ? (
                  <p>
                    <span className="font-medium">Timeline:</span> {format(new Date(item.startDate), 'MMM d, yyyy')} - {format(new Date(item.dueDate), 'MMM d, yyyy')}
                    <span className="ml-1 text-muted-foreground">({differenceInDays(new Date(item.dueDate), new Date(item.startDate))} days)</span>
                  </p>
                ) : item.dueDate ? (
                  <p><span className="font-medium">Due:</span> {format(new Date(item.dueDate), 'MMM d, yyyy')}</p>
                ) : item.startDate ? (
                  <p><span className="font-medium">Started:</span> {format(new Date(item.startDate), 'MMM d, yyyy')}</p>
                ) : null}
              </div>
              {item.progress !== undefined && (
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium">Progress</p>
                    <p className="text-xs font-medium">{item.progress}%</p>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div 
                      className="h-2 rounded-full transition-all duration-500"
                      style={{ 
                        width: `${item.progress}%`,
                        backgroundColor: item.color || 
                          (item.progress >= 100 ? "var(--green-500)" : 
                          item.progress > 66 ? "var(--green-400)" :
                          item.progress > 33 ? "var(--yellow-500)" : "var(--orange-500)")
                      }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </>
  );
} 