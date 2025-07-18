import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAuthSession } from "@/lib/auth";
import { getTaskById } from "@/actions/task";
import TaskDetailClient from "@/components/tasks/TaskDetailClient";

interface TaskDetailPageProps {
  params: {
    workspaceId: string;
    taskId: string;
  };
  searchParams?: {
    boardId?: string;
  };
}

export default async function TaskDetailPage({ params, searchParams }: TaskDetailPageProps) {
  const session = await getAuthSession();
  const _params = await params;
  const _searchParams = await searchParams;
  if (!session?.user) {
    notFound();
  }
  
  try {
    // Get task details using server action
    const task = await getTaskById(_params.taskId);
    // Use boardId from searchParams or fallback to task's board ID
    const boardId = _searchParams?.boardId || task.taskBoardId || '';
    
    return (
      <div className="container py-6 space-y-6">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" asChild className="gap-1">
            <Link href={`/${_params.workspaceId}/tasks?board=${boardId}`}>
              <ArrowLeft className="h-4 w-4" />
              Back to Board
            </Link>
          </Button>
        </div>
        
        <Suspense fallback={<div>Loading task details...</div>}>
          <TaskDetailClient task={(task as any)} showHeader={true} boardId={boardId} />
        </Suspense>
      </div>
    );
  } catch (error) {
    console.error("Error loading task details:", error);
    notFound();
  }
}