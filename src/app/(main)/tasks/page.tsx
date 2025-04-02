import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import TasksHeader from "@/components/tasks/TasksHeader";
import KanbanBoard from "@/components/tasks/KanbanBoard";
import ListView from "@/components/tasks/ListView";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";

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
      <TasksHeader />
      
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