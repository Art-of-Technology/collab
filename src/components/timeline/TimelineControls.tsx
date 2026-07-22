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
    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 px-6 py-4 border-b border-collab-700 bg-collab-900">
      {/* Header Info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-collab-800">
          <Calendar className="h-4 w-4 text-collab-50" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-collab-50 flex items-center gap-2">
            Project Timeline
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-collab-400">
              {format(timelineStart, "MMM d")} - {format(timelineEnd, "MMM d, yyyy")}
            </span>
            <Badge 
              variant="outline" 
              className="bg-collab-800 text-collab-400 border-collab-600 px-2 py-0.5 text-xs font-normal"
            >
              Timeline View
            </Badge>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Zoom Controls */}
        <div className="flex items-center bg-collab-800 rounded-md border border-collab-600">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={zoomOut} 
            className="h-7 w-7 text-collab-400 hover:text-collab-50 hover:bg-collab-600 rounded-r-none border-r border-collab-600"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <div className="w-20 px-2">
            <Slider
              value={[zoomLevel]}
              onValueChange={onZoomChange}
              max={100}
              step={5}
              className="w-full [&_[role=slider]]:bg-collab-50 [&_[role=slider]]:border-collab-600 [&_.bg-primary]:bg-blue-600"
            />
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={zoomIn} 
            className="h-7 w-7 text-collab-400 hover:text-collab-50 hover:bg-collab-600 rounded-l-none border-l border-collab-600"
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
              "h-7 px-3 text-xs text-collab-400 hover:text-collab-50 hover:bg-collab-800",
              "border border-collab-600 bg-collab-900"
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
              "h-7 px-3 text-xs text-collab-400 hover:text-collab-50 hover:bg-collab-800",
              "border border-collab-600 bg-collab-900"
            )}
          >
            Today
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={shiftRight} 
            className={cn(
              "h-7 px-3 text-xs text-collab-400 hover:text-collab-50 hover:bg-collab-800",
              "border border-collab-600 bg-collab-900"
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