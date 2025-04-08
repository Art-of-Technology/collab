'use client';

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Loader2 } from "lucide-react";
import TasksHeader from "@/components/tasks/TasksHeader";
import KanbanBoard from "@/components/tasks/KanbanBoard";
import ListView from "@/components/tasks/ListView";
import ProjectHierarchyBoard from "@/components/tasks/ProjectHierarchyBoard";
import { TasksProvider } from "@/context/TasksContext";

interface TasksClientProps {
  initialData: {
    currentUserId: string;
    workspaceId: string | null;
    boards: any[];
    hasNoWorkspace: boolean;
  };
}

export default function TasksClient({ initialData }: TasksClientProps) {
  const searchParams = useSearchParams();
  const boardId = searchParams.get("board") || undefined;
  const viewParam = searchParams.get("view") || "kanban";
  const view = (viewParam === "list" || viewParam === "kanban" || viewParam === "hierarchy") ? viewParam : "kanban";
  
  if (initialData.hasNoWorkspace) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="text-center space-y-2">
          <h3 className="text-xl font-medium">No workspace available</h3>
          <p className="text-muted-foreground">
            You need to create or join a workspace to view tasks
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <TasksProvider initialBoardId={boardId} initialView={view} initialBoards={initialData.boards} workspaceId={initialData.workspaceId as string}>
      <div className="space-y-8 w-full">
        <Suspense fallback={
          <div className="p-4 animate-pulse">
            <div className="h-10 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
            <div className="h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        }>
          <TasksHeader />
        </Suspense>
        
        <Suspense fallback={
          <div className="flex justify-center items-center h-[50vh]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        }>
          <div className="space-y-4" key={`view-${view}-board-${boardId}`}>
            {view === "kanban" ? (
              <KanbanBoard key="kanban-view" />
            ) : view === "list" ? (
              <ListView key="list-view" />
            ) : (
              <ProjectHierarchyBoard key="hierarchy-view" />
            )}
          </div>
        </Suspense>
      </div>
    </TasksProvider>
  );
} 