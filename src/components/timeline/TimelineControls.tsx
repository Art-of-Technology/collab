"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, ZoomIn, ZoomOut, Calendar } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface TimelineControlsProps {
  timelineStart: Date;
  timelineEnd: Date;
  zoomLevel: number;
  onZoomChange: (value: number[]) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  shiftLeft: () => void;
  shiftRight: () => void;
}

export function TimelineControls({
  timelineStart,
  timelineEnd,
  zoomLevel,
  onZoomChange,
  zoomIn,
  zoomOut,
  resetView,
  shiftLeft,
  shiftRight
}: TimelineControlsProps) {
  return (
    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 px-6 py-4 border-b border-[#1a1a1a] bg-[#0e0e0e]">
      {/* Header Info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-[#1a1a1a]">
          <Calendar className="h-4 w-4 text-[#e6edf3]" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[#e6edf3] flex items-center gap-2">
            Project Timeline
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-[#8b949e]">
              {format(timelineStart, "MMM d")} - {format(timelineEnd, "MMM d, yyyy")}
            </span>
            <Badge 
              variant="outline" 
              className="bg-[#1a1a1a] text-[#8b949e] border-[#333] px-2 py-0.5 text-xs font-normal"
            >
              Timeline View
            </Badge>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Zoom Controls */}
        <div className="flex items-center bg-[#1a1a1a] rounded-md border border-[#333]">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={zoomOut} 
            className="h-7 w-7 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#2a2a2a] rounded-r-none border-r border-[#333]"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <div className="w-20 px-2">
            <Slider
              value={[zoomLevel]}
              onValueChange={onZoomChange}
              max={100}
              step={5}
              className="w-full [&_[role=slider]]:bg-[#e6edf3] [&_[role=slider]]:border-[#333] [&_.bg-primary]:bg-[#0969da]"
            />
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={zoomIn} 
            className="h-7 w-7 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#2a2a2a] rounded-l-none border-l border-[#333]"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>
        
        {/* Navigation Controls */}
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={shiftLeft} 
            className={cn(
              "h-7 px-3 text-xs text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1a1a]",
              "border border-[#333] bg-[#0e0e0e]"
            )}
          >
            <ArrowLeft className="h-3 w-3 mr-1.5" />
            Back
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={resetView} 
            className={cn(
              "h-7 px-3 text-xs text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1a1a]",
              "border border-[#333] bg-[#0e0e0e]"
            )}
          >
            Today
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={shiftRight} 
            className={cn(
              "h-7 px-3 text-xs text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1a1a]",
              "border border-[#333] bg-[#0e0e0e]"
            )}
          >
            Forward
            <ArrowRight className="h-3 w-3 ml-1.5" />
          </Button>
        </div>
      </div>
    </div>
  );
} 