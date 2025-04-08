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
    <div className="flex h-full items-center justify-center">
      <div className="bg-card/95 backdrop-blur-sm rounded-lg shadow-sm p-8 max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
          <Calendar className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-lg font-medium mb-2">No timeline items yet</h3>
        <p className="text-muted-foreground mb-6">
          To see items on the timeline, add start and due dates to your milestones, epics, or stories.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="sm" onClick={onCreateMilestone} variant="default">
            <Plus className="h-4 w-4 mr-1" />
            Add Milestone
          </Button>
          <Button size="sm" onClick={onCreateEpic} variant="outline">
            <Plus className="h-4 w-4 mr-1" />
            Add Epic
          </Button>
          <Button size="sm" onClick={onCreateStory} variant="outline">
            <Plus className="h-4 w-4 mr-1" />
            Add Story
          </Button>
        </div>
      </div>
    </div>
  );
} 