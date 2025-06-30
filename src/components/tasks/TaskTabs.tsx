"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, Clock, History, Users, Link as LinkIcon } from "lucide-react";
// TaskCommentsList replaced with UnifiedCommentsSection
import { TaskHelpersSection } from "./TaskHelpersSection";
import { TaskWorkSessions } from "./TaskWorkSessions";
import { TaskActivity } from "./TaskActivity";
import { UnifiedCommentsSection } from "@/components/ui/unified-comments-section";
import BoardItemActivityHistory from "@/components/activity/BoardItemActivityHistory";
import { RelationsSection } from "@/components/ui/relations-section";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import type { TaskComment } from "@/types/task";
import { BoardItemType as ActivityBoardItemType } from "@/lib/board-item-activity-service";

type BoardItemType = 'task' | 'epic' | 'story' | 'milestone';

interface BoardItemTabsProps {
  itemType: BoardItemType;
  itemId: string;
  initialComments?: TaskComment[] | any[];
  currentUserId: string;
  assigneeId?: string;
  reporterId?: string;
  itemData?: any; // The actual item data for relations
  onRefresh: () => void;
}

export function BoardItemTabs({
  itemType,
  itemId,
  initialComments = [],
  currentUserId,
  assigneeId,
  reporterId,
  itemData,
  onRefresh,
}: BoardItemTabsProps) {
  const { settings } = useWorkspaceSettings();

  // Determine which tabs to show based on item type
  const showSessions = itemType === 'task' && settings?.timeTrackingEnabled;
  const showHelpers = itemType === 'task';
  const showRelations = !!itemData; // Show relations tab if itemData is provided

  // Calculate grid columns dynamically - removed comments from tab count
  const tabCount = 1 + (showSessions ? 1 : 0) + (showHelpers ? 1 : 0) + (showRelations ? 1 : 0);
  const gridCols = `grid-cols-${tabCount}`;

  // Map item types for different services
  const activityItemType: ActivityBoardItemType = itemType.toUpperCase() as ActivityBoardItemType;

  return (
    <div>
      {/* Tabs for Relations and Activity only */}
      <Tabs defaultValue={showRelations ? "relations" : "activity"} className="w-full ">
        <TabsList className={`grid w-full ${gridCols} lg:w-auto lg:inline-flex`}>
          {showRelations && (
            <TabsTrigger value="relations" className="flex items-center gap-2">
              <LinkIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Relations</span>
            </TabsTrigger>
          )}

          {showSessions && (
            <TabsTrigger value="sessions" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Sessions</span>
            </TabsTrigger>
          )}

          {showHelpers && (
            <TabsTrigger value="helpers" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Helpers</span>
            </TabsTrigger>
          )}

          <TabsTrigger value="activity" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">Activity</span>
          </TabsTrigger>
        </TabsList>
        <div className="mt-4">
          {showRelations && (
            <TabsContent value="relations" className="mt-0 ">
              <RelationsSection
                itemType={itemType}
                itemData={itemData}
              />
            </TabsContent>
          )}

          {showHelpers && (
            <TabsContent value="helpers" className="mt-0 ">
              <TaskHelpersSection
                taskId={itemId}
                assigneeId={assigneeId}
                reporterId={reporterId || ''}
                currentUserId={currentUserId}
                onRefresh={onRefresh}
              />
            </TabsContent>
          )}

          {showSessions && (
            <TabsContent value="sessions" className="mt-0 ">
              <TaskWorkSessions taskId={itemId} onRefresh={onRefresh} />
            </TabsContent>
          )}

          <TabsContent value="activity" className="mt-0 ">
            {itemType === 'task' ? (
              <TaskActivity taskId={itemId} />
            ) : (
              <BoardItemActivityHistory
                itemType={activityItemType}
                itemId={itemId}
              />
            )}
          </TabsContent>
        </div>
      </Tabs>
      <div className="mt-4">
        {/* Comments Section - Always visible outside of tabs */}
        <h3 className="text-lg font-semibold mt-0 flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Comments
        </h3>
        <UnifiedCommentsSection
          itemType={itemType}
          itemId={itemId}
          initialComments={initialComments}
          currentUserId={currentUserId}
        />
      </div>
    </div>
  );
}

// Keep the original TaskTabs as a wrapper for backward compatibility
interface TaskTabsProps {
  taskId: string;
  initialComments: TaskComment[];
  currentUserId: string;
  assigneeId?: string;
  reporterId: string;
  taskData?: any; // Optional task data for relations
  onRefresh: () => void;
}

export function TaskTabs({
  taskId,
  initialComments,
  currentUserId,
  assigneeId,
  reporterId,
  taskData,
  onRefresh,
}: TaskTabsProps) {
  return (
    <BoardItemTabs
      itemType="task"
      itemId={taskId}
      initialComments={initialComments}
      currentUserId={currentUserId}
      assigneeId={assigneeId}
      reporterId={reporterId}
      itemData={taskData}
      onRefresh={onRefresh}
    />
  );
}
