"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Calendar, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { TimelineItem } from "./TimelineItem";

interface TimelineSectionProps {
  title: string;
  type: 'milestone' | 'epic' | 'story';
  items: any[];
  isCollapsed: boolean;
  toggleSection: (section: 'milestone' | 'epic' | 'story') => void;
  totalDays: number;
  dayWidth: number;
  timelineStart: Date;
  getTypeStyles: (type: string) => {
    bg: string;
    hover: string;
    border: string;
    icon: React.ReactNode;
    header: string;
  };
}

export function TimelineSection({
  title,
  type,
  items,
  isCollapsed,
  toggleSection,
  totalDays,
  dayWidth,
  timelineStart,
  getTypeStyles
}: TimelineSectionProps) {
  const typeStyles = getTypeStyles(type);
  
  if (items.length === 0) return null;

  // Responsive column width matching other components
  const getResponsiveColumnWidth = () => {
    return `clamp(80px, 15vw, 150px)`;
  };

  // Responsive day width
  const getResponsiveDayWidth = () => {
    return `max(${Math.max(dayWidth, 20)}px, 20px)`;
  };
  
  return (
    <div className="timeline-section">
      {/* Section Header*/}
      <div 
        className={cn(
          "grid items-center sticky left-0 z-10 cursor-pointer transition-colors border-b overflow-x-auto",
          typeStyles.header
        )}
        style={{ 
          gridTemplateColumns: `${getResponsiveColumnWidth()} repeat(${totalDays}, ${getResponsiveDayWidth()})`,
          minWidth: `calc(${getResponsiveColumnWidth()} + ${totalDays * Math.max(dayWidth, 20)}px)`
        }}
        onClick={() => toggleSection(type)}
      >
        <div className="flex items-center p-1.5 sm:p-2 font-semibold border-r min-h-[44px] sm:min-h-[40px]">
          <div className="flex items-center flex-1 gap-1.5 sm:gap-2 overflow-hidden">
            {/* Mobile-first icons with better touch targets */}
            <div className="flex-shrink-0">
              {type === 'milestone' && <Star className="h-4 w-4 sm:h-4 sm:w-4 text-indigo-500" />}
              {type === 'epic' && <Calendar className="h-4 w-4 sm:h-4 sm:w-4 text-purple-500" />}
              {type === 'story' && <div className="h-4 w-4 sm:h-4 sm:w-4 rounded-sm bg-blue-400"></div>}
            </div>
            
            <span className="truncate text-xs sm:text-sm font-medium">
              <span className="hidden sm:inline">{title} ({items.length})</span>
              <span className="sm:hidden">{title.split(' ')[0]} ({items.length})</span>
            </span>
          </div>
          
          
          <Button 
            variant="ghost" 
            size="icon" 
            className="ml-1 sm:ml-auto h-8 w-8 sm:h-6 sm:w-6 flex-shrink-0 touch-manipulation"
            onClick={(e) => {
              e.stopPropagation();
              toggleSection(type);
            }}
          >
            {isCollapsed ? 
              <ArrowRight className="h-4 w-4 sm:h-3.5 sm:w-3.5" /> : 
              <ArrowLeft className="h-4 w-4 sm:h-3.5 sm:w-3.5 rotate-90" />
            }
          </Button>
        </div>
        {/* Empty cells for the timeline days - span full width minus the first column */}
        <div style={{ gridColumn: `2 / span ${totalDays}` }}></div>
      </div>
      
      {/* Section Items */}
      {!isCollapsed && (
        <div className="timeline-items">
          {items.map((item, index) => (
            <div 
              key={item.id} 
              className="relative border-b border-border/50" 
              style={{ 
                height: "36px",
                minHeight: "36px"
              }}
            >
              <TimelineItem
                item={item}
                typeStyles={typeStyles}
                timelineStart={timelineStart}
                dayWidth={Math.max(dayWidth, 20)}
                totalDays={totalDays}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 