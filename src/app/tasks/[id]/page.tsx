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

  // Combined DB call: find task and check workspace access
  const taskWithWorkspace = await prisma.task.findFirst({
    where: {
      OR: [
        { id },
        { issueKey: id },
      ],
    },
    include: {
      workspace: {
        select: {
          id: true,
          ownerId: true,
          members: {
            select: {
              userId: true,
            },
          },
        },
      },
    },
  });

  if (!taskWithWorkspace) {
    notFound();
  }

  const { workspace } = taskWithWorkspace;
  const userHasAccess =
    workspace.ownerId === session.user.id ||
    workspace.members.some((member) => member.userId === session.user.id);

  if (!userHasAccess) {
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