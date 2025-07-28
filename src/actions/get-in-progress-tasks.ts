"use server";

import { prisma } from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth";

async function getCurrentWorkspaceId(userId: string) {
  const userWorkspace = await prisma.workspaceMember.findFirst({
    where: {
      userId,
    },
    select: {
      workspaceId: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return userWorkspace?.workspaceId;
}

export async function getInProgressTasks() {
  const session = await getAuthSession();

  if (!session?.user.id) {
    throw new Error("Unauthorized");
  }

  const workspaceId = await getCurrentWorkspaceId(session.user.id);

  if (!workspaceId) {
    return { usersWithTasks: [] };
  }

  const tasks = await prisma.task.findMany({
    where: {
      workspaceId,
      status: "In Progress",
    },
    include: {
      assignee: {
        select: {
          id: true,
          name: true,
          image: true,
          role: true,
        },
      },
      taskBoard: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  console.log('Total in progress task count', tasks.length)
  console.log(tasks)
  return { tasks };
}