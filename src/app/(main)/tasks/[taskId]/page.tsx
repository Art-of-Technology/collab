import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TaskDetailContent, Task } from "@/components/tasks/TaskDetailContent";

interface TaskDetailPageProps {
  params: {
    taskId: string;
  };
  searchParams?: {
    boardId?: string;
  };
}

async function getTaskDetails(taskIdOrKey: string): Promise<Task | null> {
  const user = await getCurrentUser();
  
  if (!user) {
    throw new Error("Unauthorized");
  }
  
  // Check if taskIdOrKey is an issue key (e.g., WZB-1)
  const isIssueKey = /^[A-Z]+-\d+$/.test(taskIdOrKey);
  
  // Fetch the task either by ID or issue key
  const task = isIssueKey 
    ? await prisma.task.findFirst({
        where: { issueKey: taskIdOrKey },
        include: {
          assignee: true,
          reporter: true,
          column: true,
          taskBoard: true,
          workspace: true,
          labels: true,
          comments: {
            include: {
              author: true,
            },
            orderBy: {
              createdAt: "desc",
            },
          },
          attachments: true,
        },
      })
    : await prisma.task.findUnique({
        where: { id: taskIdOrKey },
        include: {
          assignee: true,
          reporter: true,
          column: true,
          taskBoard: true,
          workspace: true,
          labels: true,
          comments: {
            include: {
              author: true,
            },
            orderBy: {
              createdAt: "desc",
            },
          },
          attachments: true,
        },
      });
  
  if (!task) {
    return null;
  }
  
  // Check if user has access to the workspace
  const hasAccess = await prisma.workspaceMember.findFirst({
    where: {
      userId: user.id,
      workspaceId: task.workspaceId,
    },
  });
  
  if (!hasAccess) {
    throw new Error("Access denied");
  }
  
  // Map database attachments to component interface
  const transformedTask = {
    ...task,
    attachments: task.attachments.map(attachment => ({
      id: attachment.id,
      name: attachment.fileName,
      url: attachment.fileUrl
    }))
  };
  
  return transformedTask as Task;
}

export default async function TaskDetailPage({ params, searchParams }: TaskDetailPageProps) {
  const task = await getTaskDetails(params.taskId);
  const boardId = searchParams?.boardId || '';
  
  if (!task) {
    notFound();
  }
  
  // This is a server component, so we'll simulate the refresh by using 
  // a client-side component for comments and other interactive elements
  
  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" asChild className="gap-1">
          <Link href={`/tasks?board=${boardId}`}>
            <ArrowLeft className="h-4 w-4" />
            Back to Board
          </Link>
        </Button>
      </div>
      
      <Suspense fallback={<div>Loading task details...</div>}>
        <TaskDetailContent
          task={task}
          isLoading={false}
          error={null}
          onRefresh={() => {}}
          showHeader={true}
        />
      </Suspense>
    </div>
  );
}