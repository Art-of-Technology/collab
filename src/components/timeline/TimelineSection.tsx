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
  
  return (
    <div className="timeline-section">
      {/* Section Header */}
      <div 
        className={cn(
          "grid items-center sticky left-0 z-10 cursor-pointer transition-colors border-b",
          typeStyles.header
        )}
        style={{ 
          gridTemplateColumns: `150px repeat(${totalDays}, ${dayWidth}px)`,
          width: `calc(150px + ${totalDays * dayWidth}px)`
        }}
        onClick={() => toggleSection(type)}
      >
        <div className="flex items-center p-2 font-semibold border-r">
          {type === 'milestone' && <Star className="h-4 w-4 mr-2 text-indigo-500" />}
          {type === 'epic' && <Calendar className="h-4 w-4 mr-2 text-purple-500" />}
          {type === 'story' && <div className="h-4 w-4 mr-2 rounded-sm bg-blue-400"></div>}
          
          <span>{title} ({items.length})</span>
          <Button 
            variant="ghost" 
            size="icon" 
            className="ml-auto h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              toggleSection(type);
            }}
          >
            {isCollapsed ? 
              <ArrowRight className="h-3.5 w-3.5" /> : 
              <ArrowLeft className="h-3.5 w-3.5 rotate-90" />
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
              className="relative" 
              style={{ 
                height: "40px", 
                borderBottom: "1px solid var(--border)"
              }}
            >
              <TimelineItem
                item={item}
                indexInGroup={index}
                typeStyles={typeStyles}
                timelineStart={timelineStart}
                dayWidth={dayWidth}
                totalDays={totalDays}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 