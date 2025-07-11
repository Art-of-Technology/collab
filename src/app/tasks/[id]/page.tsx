import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth";

interface PageProps {
  params: { id: string };
}

export default async function TaskShortlinkPage({ params }: PageProps) {
  const session = await getAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = params;

  // Single DB call: find by id OR issueKey
  const task = await prisma.task.findFirst({
    where: {
      OR: [
        { id },
        { issueKey: id },
      ],
    },
    select: {
      id: true,
      workspaceId: true,
      taskBoardId: true,
    },
  });

  if (!task) {
    notFound();
  }

  // Check if user has access to the workspace (either as owner or member)
  const workspaceAccess = await prisma.workspace.findFirst({
    where: {
      id: task.workspaceId,
      OR: [
        { ownerId: session.user.id }, // User is the owner
        { members: { some: { userId: session.user.id } } } // User is a member
      ]
    },
    select: {
      id: true,
    }
  });

  if (!workspaceAccess) {
    // User doesn't have access to this workspace
    notFound();
  }

  // Build canonical URL with URL-encoded values
  const encodedWorkspaceId = encodeURIComponent(task.workspaceId || '');
  const encodedTaskBoardId = encodeURIComponent(task.taskBoardId || '');
  const encodedTaskId = encodeURIComponent(task.id);
  
  const canonicalUrl = `/${encodedWorkspaceId}/tasks?board=${encodedTaskBoardId}&taskId=${encodedTaskId}`;
  redirect(canonicalUrl);
} 