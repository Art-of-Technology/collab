import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth";

interface PageProps {
  params: { id: string };
}

export default async function TaskShortlinkPage({ params }: PageProps) {
  const { id } = params;

  const task =
    (await prisma.task.findUnique({
      where: { id },
      include: {
        workspace: {
          select: {
            id: true,
            ownerId: true,
            members: { select: { userId: true } }
          }
        },
        taskBoard: { select: { id: true } }
      }
    })) ||
    (await prisma.task.findFirst({
      where: { issueKey: id },
      include: {
        workspace: {
          select: {
            id: true,
            ownerId: true,
            members: { select: { userId: true } }
          }
        },
        taskBoard: { select: { id: true } }
      }
    }));

  if (!task) {
    notFound();
  }

  if (!task.workspace || !task.taskBoard) {
    notFound();
  }

  const encodedWorkspaceId = encodeURIComponent(task.workspace.id);
  const encodedTaskBoardId = encodeURIComponent(task.taskBoard.id);
  const encodedTaskId = encodeURIComponent(task.id);
  const canonicalUrl = `/${encodedWorkspaceId}/tasks?board=${encodedTaskBoardId}&taskId=${encodedTaskId}`;

  const session = await getAuthSession();
  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(canonicalUrl)}`);
  }

  const userHasAccess =
    task.workspace.ownerId === session.user.id ||
    task.workspace.members.some((member) => member.userId === session.user.id);

  if (!userHasAccess) {
    notFound();
  }

  redirect(canonicalUrl);
} 