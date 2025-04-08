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
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
      <div>
        <h2 className="text-lg font-medium flex items-center gap-2">
          Project Timeline
          <Badge variant="outline" className="ml-2 font-normal">
            {format(timelineStart, "MMM d")} - {format(timelineEnd, "MMM d, yyyy")}
          </Badge>
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Visualize project milestones, epics, and stories over time
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center">
          <Button variant="outline" size="icon" onClick={zoomOut} className="rounded-r-none h-8 w-8">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <div className="w-28 px-2">
            <Slider
              value={[zoomLevel]}
              onValueChange={onZoomChange}
              max={100}
              step={5}
              className="w-full"
            />
          </div>
          <Button variant="outline" size="icon" onClick={zoomIn} className="rounded-l-none h-8 w-8">
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={shiftLeft} className="h-8">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Back
          </Button>
          <Button variant="outline" size="sm" onClick={resetView} className="h-8">
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={shiftRight} className="h-8">
            Forward
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
} 