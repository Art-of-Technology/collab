"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Plus, Calendar } from "lucide-react";

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
    <div className="flex h-full items-center justify-center p-4 sm:p-8">
      <div className="bg-card/95 backdrop-blur-sm rounded-lg shadow-sm p-4 sm:p-8 max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-primary/10 mb-3 sm:mb-4">
          <Calendar className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
        </div>
        <h3 className="text-base sm:text-lg font-medium mb-2">No timeline items yet</h3>
        <p className="text-sm sm:text-base text-muted-foreground mb-4 sm:mb-6 leading-relaxed">
          To see items on the timeline, add start and due dates to your milestones, epics, or stories.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-2 sm:justify-center">
          <Button 
            size="sm" 
            onClick={onCreateMilestone} 
            variant="default"
            className="h-10 sm:h-8 w-full sm:w-auto px-4 text-sm font-medium"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Milestone
          </Button>
          <Button 
            size="sm" 
            onClick={onCreateEpic} 
            variant="outline"
            className="h-10 sm:h-8 w-full sm:w-auto px-4 text-sm font-medium"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Epic
          </Button>
          <Button 
            size="sm" 
            onClick={onCreateStory} 
            variant="outline"
            className="h-10 sm:h-8 w-full sm:w-auto px-4 text-sm font-medium"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Story
          </Button>
        </div>
      </div>
    </div>
  );
} 