"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Calendar, Star, Layers, BookOpen } from "lucide-react";
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

  const getTypeIcon = () => {
    switch (type) {
      case 'milestone':
        return <Star className="h-3.5 w-3.5 text-amber-400" />;
      case 'epic':
        return <Layers className="h-3.5 w-3.5 text-violet-500" />;
      case 'story':
        return <BookOpen className="h-3.5 w-3.5 text-cyan-500" />;
      default:
        return <Calendar className="h-3.5 w-3.5 text-collab-400" />;
    }
  };
  
  return (
    <div className="timeline-section">
      {/* Section Header */}
      <div 
        className={cn(
          "grid items-center sticky left-0 z-10 cursor-pointer transition-colors border-b border-collab-700",
          "bg-collab-900 hover:bg-collab-900"
        )}
        style={{ 
          gridTemplateColumns: `150px repeat(${totalDays}, ${dayWidth}px)`,
          width: `calc(150px + ${totalDays * dayWidth}px)`
        }}
        onClick={() => toggleSection(type)}
      >
        <div className="flex items-center px-3 py-2 font-medium border-r border-collab-600 bg-collab-800">
          <div className="flex items-center gap-2 flex-1">
            {getTypeIcon()}
            <span className="text-sm text-collab-50">{title}</span>
            <span className="text-xs text-collab-400 bg-collab-600 px-1.5 py-0.5 rounded">
              {items.length}
            </span>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-5 w-5 text-collab-400 hover:text-collab-50 hover:bg-collab-600"
            onClick={(e) => {
              e.stopPropagation();
              toggleSection(type);
            }}
          >
            {isCollapsed ? 
              <ArrowRight className="h-3 w-3" /> : 
              <ArrowLeft className="h-3 w-3 rotate-90" />
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
              className={cn(
                "relative transition-colors hover:bg-collab-900/50",
                index % 2 === 0 ? "bg-collab-900" : "bg-collab-900"
              )}
              style={{ 
                height: "36px", 
                borderBottom: "1px solid #1a1a1a"
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