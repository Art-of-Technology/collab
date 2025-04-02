import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import TasksHeader from "@/components/tasks/TasksHeader";
import KanbanBoard from "@/components/tasks/KanbanBoard";
import ListView from "@/components/tasks/ListView";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";

export const dynamic = 'force-dynamic';

interface TasksPageProps {
  searchParams?: {
    view?: string;
    board?: string;
  };
}

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const _searchParams = await searchParams || {};
  const currentUser = await getCurrentUser();
  
  if (!currentUser) {
    redirect("/login");
  }
  
  // Get user's workspace ID
  const userWorkspace = await prisma.workspaceMember.findFirst({
    where: {
      userId: currentUser.id,
    },
    select: {
      workspaceId: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });
  
  if (!userWorkspace) {
    redirect("/dashboard");
  }
  
  // View is determined client-side via TasksContext now
  const view = _searchParams?.view || "kanban";
  const boardId = _searchParams?.board || "";

  return (
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
          ) : (
            <ListView key="list-view" />
          )}
        </div>
      </Suspense>
    </div>
  );
} 