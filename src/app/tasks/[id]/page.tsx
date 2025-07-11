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

  // Build canonical URL
  const canonicalUrl = `/${task.workspaceId}/tasks?board=${task.taskBoardId}&taskId=${task.id}`;
  redirect(canonicalUrl);
} 