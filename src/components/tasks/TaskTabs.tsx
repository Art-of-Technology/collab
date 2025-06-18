"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, Clock, History, Users } from "lucide-react";
import { TaskCommentsList } from "./TaskCommentsList";
import { TaskHelpersSection } from "./TaskHelpersSection";
import { TaskWorkSessions } from "./TaskWorkSessions";
import { TaskActivity } from "./TaskActivity";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import type { TaskComment } from "@/types/task";

interface TaskTabsProps {
  taskId: string;
  initialComments: TaskComment[];
  currentUserId: string;
  assigneeId?: string;
  reporterId: string;
  onRefresh: () => void;
}

export function TaskTabs({
  taskId,
  initialComments,
  currentUserId,
  assigneeId,
  reporterId,
  onRefresh,
}: TaskTabsProps) {
  const { settings } = useWorkspaceSettings();

  return (
    <div className="mt-6">
      <Tabs defaultValue="comments" className="w-full">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
          <TabsTrigger value="comments" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Comments</span>
          </TabsTrigger>
          {settings?.timeTrackingEnabled && (
            <TabsTrigger value="sessions" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Sessions</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="helpers" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Helpers</span>
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">Activity</span>
          </TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <TabsContent value="comments" className="mt-0 min-h-[400px]">
            <TaskCommentsList taskId={taskId} initialComments={initialComments} currentUserId={currentUserId} />
          </TabsContent>

          <TabsContent value="helpers" className="mt-0 min-h-[400px]">
            <TaskHelpersSection
              taskId={taskId}
              assigneeId={assigneeId}
              reporterId={reporterId}
              currentUserId={currentUserId}
              onRefresh={onRefresh}
            />
          </TabsContent>

          {settings?.timeTrackingEnabled && (
            <TabsContent value="sessions" className="mt-0 min-h-[400px]">
              <TaskWorkSessions taskId={taskId} onRefresh={onRefresh} />
            </TabsContent>
          )}

          <TabsContent value="activity" className="mt-0 min-h-[400px]">
            <TaskActivity
              taskId={taskId}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
