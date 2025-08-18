"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Plus, Calendar, Star, Layers, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimelineEmptyProps {
  onCreateMilestone: () => void;
  onCreateEpic: () => void;
  onCreateStory: () => void;
}

export function TimelineEmpty({
  onCreateMilestone,
  onCreateEpic,
  onCreateStory
}: TimelineEmptyProps) {
  return (
    <div className="flex h-full items-center justify-center bg-[#101011] p-8">
      <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded-lg shadow-lg p-8 max-w-lg text-center">
        {/* Icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#1a1a1a] border border-[#333] mb-6">
          <Calendar className="h-8 w-8 text-[#8b949e]" />
        </div>
        
        {/* Content */}
        <div className="space-y-4 mb-8">
          <h3 className="text-xl font-semibold text-[#e6edf3]">
            No timeline items yet
          </h3>
          <p className="text-[#8b949e] text-sm leading-relaxed">
            Create milestones, epics, and stories with start and due dates to visualize your project timeline.
          </p>
        </div>
        
        {/* Action Buttons */}
        <div className="space-y-3">
          <Button 
            size="sm" 
            onClick={onCreateMilestone}
            className={cn(
              "w-full h-9 bg-[#0969da] hover:bg-[#0860ca] text-white",
              "border-0 transition-colors"
            )}
          >
            <Star className="h-4 w-4 mr-2" />
            Create Milestone
          </Button>
          
          <div className="grid grid-cols-2 gap-2">
            <Button 
              size="sm" 
              onClick={onCreateEpic}
              variant="outline"
              className={cn(
                "h-8 border-[#333] bg-[#1a1a1a] text-[#e6edf3]",
                "hover:bg-[#2a2a2a] hover:text-[#e6edf3] hover:border-[#444]"
              )}
            >
              <Layers className="h-3.5 w-3.5 mr-1.5" />
              Add Epic
            </Button>
            <Button 
              size="sm" 
              onClick={onCreateStory}
              variant="outline"
              className={cn(
                "h-8 border-[#333] bg-[#1a1a1a] text-[#e6edf3]",
                "hover:bg-[#2a2a2a] hover:text-[#e6edf3] hover:border-[#444]"
              )}
            >
              <BookOpen className="h-3.5 w-3.5 mr-1.5" />
              Add Story
            </Button>
          </div>
        </div>
        
        {/* Help Text */}
        <div className="mt-6 pt-4 border-t border-[#333]">
          <p className="text-xs text-[#666]">
            💡 Tip: Use timeline view to track project milestones and coordinate team deliverables
          </p>
        </div>
      </div>
    </div>
  );
} 