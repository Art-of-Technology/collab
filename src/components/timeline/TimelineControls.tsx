"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, ZoomIn, ZoomOut } from "lucide-react";
import { format } from "date-fns";

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
    <div className="flex flex-col gap-3 mb-4 px-2 sm:px-4">
      {/* Header Section */}
      <div className="flex flex-col gap-2 sm:gap-3">
        <h2 className="text-base sm:text-lg font-medium flex flex-col sm:flex-row sm:items-center gap-2">
          <span>Project Timeline</span>
          <Badge variant="outline" className="self-start sm:self-auto font-normal text-xs sm:text-sm px-2 py-1">
            <span className="hidden sm:inline">{format(timelineStart, "MMM d")} - {format(timelineEnd, "MMM d, yyyy")}</span>
            <span className="sm:hidden">{format(timelineStart, "MMM d")} - {format(timelineEnd, "MMM d")}</span>
          </Badge>
        </h2>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          Visualize project milestones, epics, and stories over time
        </p>
      </div>

      {/* Controls Section*/}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        {/* Zoom Controls */}
        <div className="flex items-center justify-center sm:justify-start">
          <Button variant="outline" size="icon" onClick={zoomOut} className="rounded-r-none h-10 w-10 sm:h-8 sm:w-8">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <div className="w-24 sm:w-28 px-2 sm:px-3">
            <Slider
              value={[zoomLevel]}
              onValueChange={onZoomChange}
              max={100}
              step={5}
              className="w-full"
            />
          </div>
          <Button variant="outline" size="icon" onClick={zoomIn} className="rounded-l-none h-10 w-10 sm:h-8 sm:w-8">
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Navigation Controls */}
        <div className="flex items-center justify-center gap-2 sm:gap-1">
          <Button variant="outline" size="sm" onClick={shiftLeft} className="h-10 sm:h-8 px-3 sm:px-2 flex-1 sm:flex-initial">
            <ArrowLeft className="h-4 w-4 sm:h-3.5 sm:w-3.5 mr-1" />
            <span className="text-sm sm:text-xs">Back</span>
          </Button>
          <Button variant="outline" size="sm" onClick={resetView} className="h-10 sm:h-8 px-3 sm:px-2 flex-1 sm:flex-initial">
            <span className="text-sm sm:text-xs">Today</span>
          </Button>
          <Button variant="outline" size="sm" onClick={shiftRight} className="h-10 sm:h-8 px-3 sm:px-2 flex-1 sm:flex-initial">
            <span className="text-sm sm:text-xs">Forward</span>
            <ArrowRight className="h-4 w-4 sm:h-3.5 sm:w-3.5 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
} 