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
    <div className="flex h-full items-center justify-center bg-collab-900 p-8">
      <div className="bg-collab-900 border border-collab-700 rounded-lg shadow-lg p-8 max-w-lg text-center">
        {/* Icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-collab-800 border border-collab-600 mb-6">
          <Calendar className="h-8 w-8 text-collab-400" />
        </div>
        
        {/* Content */}
        <div className="space-y-4 mb-8">
          <h3 className="text-xl font-semibold text-collab-50">
            No timeline items yet
          </h3>
          <p className="text-collab-400 text-sm leading-relaxed">
            Create milestones, epics, and stories with start and due dates to visualize your project timeline.
          </p>
        </div>
        
        {/* Action Buttons */}
        <div className="space-y-3">
          <Button 
            size="sm" 
            onClick={onCreateMilestone}
            className={cn(
              "w-full h-9 bg-blue-600 hover:bg-blue-700 text-white",
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
                "h-8 border-collab-600 bg-collab-800 text-collab-50",
                "hover:bg-collab-600 hover:text-collab-50 hover:border-collab-600"
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
                "h-8 border-collab-600 bg-collab-800 text-collab-50",
                "hover:bg-collab-600 hover:text-collab-50 hover:border-collab-600"
              )}
            >
              <BookOpen className="h-3.5 w-3.5 mr-1.5" />
              Add Story
            </Button>
          </div>
        </div>
        
        {/* Help Text */}
        <div className="mt-6 pt-4 border-t border-collab-600">
          <p className="text-xs text-collab-500">
            💡 Tip: Use timeline view to track project milestones and coordinate team deliverables
          </p>
        </div>
      </div>
    </div>
  );
} 