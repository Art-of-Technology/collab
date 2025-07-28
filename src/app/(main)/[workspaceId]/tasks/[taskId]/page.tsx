import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAuthSession } from "@/lib/auth";
import { getTaskById } from "@/actions/task";
import TaskDetailClient from "@/components/tasks/TaskDetailClient";
import { urls } from "@/lib/url-resolver";
import { resolveBoardSlug, resolveWorkspaceSlug } from "@/lib/slug-resolvers";
import { resolveIssueKeyToId } from "@/lib/issue-key-resolvers";
import { isIssueKey } from "@/lib/shared-issue-key-utils";

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
    // Resolve taskId to database ID if it's an issue key
    let taskId = _params.taskId;
    if (isIssueKey(_params.taskId)) {
      const resolvedId = await resolveIssueKeyToId(_params.taskId, 'task');
      if (!resolvedId) {
        console.error(`Failed to resolve issue key: ${_params.taskId}`);
        notFound();
      }
      taskId = resolvedId;
    }
    
    // Get task details using server action
    const task = await getTaskById(taskId);
    // Use boardId from searchParams or fallback to task's board ID
    const boardId = _searchParams?.boardId || task.taskBoardId || '';
    
    // Generate back URL using URL resolver
    const getBackUrl = async (): Promise<string> => {
      try {
        // Try to resolve workspace and board slugs
        const workspaceSlug = await resolveWorkspaceSlug(_params.workspaceId);
        const boardSlug = boardId ? await resolveBoardSlug(boardId, _params.workspaceId) : null;
        
        if (workspaceSlug && boardSlug) {
          return urls.board({
            workspaceSlug,
            boardSlug,
            view: 'kanban'
          });
        }
      } catch (err) {
        console.log('Failed to resolve slugs, using fallback URL:', err);
      }
      
      // Fallback to legacy URL
      return `/${_params.workspaceId}/tasks?board=${boardId}`;
    };

    const backUrl = await getBackUrl();
    
    return (
      <div className="container py-6 space-y-6">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" asChild className="gap-1">
            <Link href={backUrl}>
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