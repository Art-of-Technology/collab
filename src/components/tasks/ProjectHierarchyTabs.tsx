"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectCalendar } from "@/components/tasks/ProjectCalendar";
import { ProjectTimeline } from "@/components/tasks/ProjectTimeline";
import { Milestone } from "@/hooks/queries/useMilestone";
import { Epic } from "@/hooks/queries/useEpic";
import { Story } from "@/hooks/queries/useStory";

interface ProjectHierarchyTabsProps {
  milestones: Milestone[];
  epics: Epic[];
  stories: Story[];
  onCreateMilestone: () => void;
  onCreateEpic: () => void;
  onCreateStory: () => void;
}

export function ProjectHierarchyTabs({
  milestones,
  epics,
  stories,
  onCreateMilestone,
  onCreateEpic,
  onCreateStory,
}: ProjectHierarchyTabsProps) {
  const [activeTab, setActiveTab] = useState("timeline");

  return (
    <Tabs 
      defaultValue="timeline" 
      value={activeTab} 
      onValueChange={setActiveTab}
      className="w-full"
    >
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Project Overview</h2>
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>
      </div>
      
      <TabsContent value="timeline" className="mt-0">
        <ProjectTimeline 
          milestones={milestones}
          epics={epics}
          stories={stories}
          onCreateMilestone={onCreateMilestone}
          onCreateEpic={onCreateEpic}
          onCreateStory={onCreateStory}
        />
      </TabsContent>
      
      <TabsContent value="calendar" className="mt-0">
        <ProjectCalendar 
          milestones={milestones}
          epics={epics}
          stories={stories}
          onCreateMilestone={onCreateMilestone}
          onCreateEpic={onCreateEpic}
          onCreateStory={onCreateStory}
        />
      </TabsContent>
    </Tabs>
  );
} 