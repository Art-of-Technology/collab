"use client";

import React from "react";
import { format, differenceInDays, parseISO } from "date-fns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, CheckCircle } from "lucide-react";
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
        return "#22c55e";
      case 'in-progress':
      case 'in progress':
        return "#0969da";
      case 'blocked':
        return "#ef4444";
      case 'planned':
      case 'backlog':
      default:
        return "#8b949e";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'done':
        return <CheckCircle className="h-3 w-3 text-[#22c55e]" />;
      case 'in-progress':
      case 'in progress':
        return <Clock className="h-3 w-3 text-[#0969da]" />;
      default:
        return <Calendar className="h-3 w-3 text-[#8b949e]" />;
    }
  };

  const { start, end } = getItemPosition(item.startDate, item.dueDate);
  const isVisible = end > 0 && start < totalDays;
  
  if (!isVisible) return null;
  
  return (
    <>
      {/* Item Label */}
      <div 
        className="px-3 py-2 text-xs font-medium border-r border-[#333] sticky left-0 z-10 bg-[#1a1a1a]"
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
        <div className="flex items-center gap-2 w-full">
          {getStatusIcon(item.status)}
          <span className="truncate text-[#e6edf3] flex-1">{item.title}</span>
        </div>
      </div>

      {/* Timeline Bar */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                "absolute h-6 rounded-md flex items-center justify-between px-2 cursor-pointer transition-all duration-200",
                "border border-[#333] shadow-sm hover:shadow-md hover:scale-[1.02]",
                "bg-gradient-to-r from-[#1a1a1a] to-[#2a2a2a]"
              )}
              style={{
                left: `calc(150px + ${start * dayWidth}px)`,
                width: `${Math.max((end - start) * dayWidth, 60)}px`,
                top: "6px",
                minWidth: '60px',
                zIndex: 5,
                borderColor: item.color || getStatusColorValue(item.status),
                boxShadow: `0 0 0 1px ${item.color || getStatusColorValue(item.status)}20`
              }}
            >
              <span className="text-xs text-[#e6edf3] truncate flex-1 pr-2">
                {item.title}
              </span>
              
              {item.progress !== undefined && (
                <Badge 
                  variant="secondary" 
                  className="bg-[#333] text-[#e6edf3] text-[10px] px-1 py-0 h-4"
                >
                  {item.progress}%
                </Badge>
              )}
              
              {/* Progress Bar */}
              {item.progress !== undefined && (
                <div
                  className="absolute bottom-0 left-0 h-1 rounded-b-md transition-all duration-500"
                  style={{ 
                    width: `${item.progress}%`,
                    backgroundColor: item.color || getStatusColorValue(item.status),
                    opacity: 0.8
                  }}
                />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent className="p-0 overflow-hidden w-80 bg-[#0e0e0e] border-[#333]">
            <div className="p-4 space-y-3">
              {/* Header */}
              <div className="flex items-center gap-3">
                <div 
                  className="w-4 h-4 rounded-full border-2"
                  style={{ 
                    backgroundColor: item.color || getStatusColorValue(item.status),
                    borderColor: (item.color || getStatusColorValue(item.status)) + '60'
                  }}
                />
                <div className="flex-1">
                  <p className="font-medium text-[#e6edf3] text-sm">{item.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge 
                      variant="outline" 
                      className="bg-[#1a1a1a] text-[#8b949e] border-[#333] text-xs"
                    >
                      {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                    </Badge>
                    <Badge 
                      variant="outline" 
                      className="bg-[#1a1a1a] border-[#333] text-xs"
                      style={{ 
                        color: item.color || getStatusColorValue(item.status),
                        borderColor: item.color || getStatusColorValue(item.status)
                      }}
                    >
                      {item.status}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Timeline Info */}
              <div className="space-y-2 pt-2 border-t border-[#333]">
                {item.startDate && item.dueDate ? (
                  <div className="text-xs text-[#8b949e]">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[#e6edf3]">Timeline</span>
                      <span>{differenceInDays(new Date(item.dueDate), new Date(item.startDate))} days</span>
                    </div>
                    <div className="mt-1">
                      {format(new Date(item.startDate), 'MMM d, yyyy')} → {format(new Date(item.dueDate), 'MMM d, yyyy')}
                    </div>
                  </div>
                ) : item.dueDate ? (
                  <div className="text-xs">
                    <span className="font-medium text-[#e6edf3]">Due:</span> 
                    <span className="text-[#8b949e] ml-1">{format(new Date(item.dueDate), 'MMM d, yyyy')}</span>
                  </div>
                ) : item.startDate ? (
                  <div className="text-xs">
                    <span className="font-medium text-[#e6edf3]">Started:</span> 
                    <span className="text-[#8b949e] ml-1">{format(new Date(item.startDate), 'MMM d, yyyy')}</span>
                  </div>
                ) : null}
              </div>

              {/* Progress */}
              {item.progress !== undefined && (
                <div className="space-y-2 pt-2 border-t border-[#333]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#e6edf3]">Progress</span>
                    <span className="text-xs font-medium text-[#e6edf3]">{item.progress}%</span>
                  </div>
                  <div className="w-full bg-[#333] rounded-full h-2">
                    <div 
                      className="h-2 rounded-full transition-all duration-500"
                      style={{ 
                        width: `${item.progress}%`,
                        backgroundColor: item.color || getStatusColorValue(item.status)
                      }}
                    />
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