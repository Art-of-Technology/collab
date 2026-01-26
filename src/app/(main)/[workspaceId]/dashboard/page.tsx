import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { Metadata } from "next";
import { verifyWorkspaceAccess } from "@/lib/workspace-helpers";
import { prisma } from "@/lib/prisma";
import { DashboardClient } from "./DashboardClient";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your AI-native workspace dashboard",
};

async function getPriorityIssues(userId: string, workspaceId: string) {
  // Get issues that need attention: assigned to user, not done, ordered by priority/due date
  const issues = await prisma.issue.findMany({
    where: {
      workspaceId,
      assigneeId: userId,
      statusValue: {
        notIn: ['done', 'closed', 'complete', 'completed'],
      },
    },
    orderBy: [
      { priority: 'asc' }, // urgent first
      { dueDate: 'asc' },
      { updatedAt: 'desc' },
    ],
    take: 6,
    select: {
      id: true,
      issueKey: true,
      title: true,
      statusValue: true,
      priority: true,
      type: true,
      dueDate: true,
      project: {
        select: {
          name: true,
        },
      },
    },
  });

  return issues.map((issue) => ({
    id: issue.id,
    key: issue.issueKey || issue.id.slice(0, 8),
    title: issue.title,
    status: issue.statusValue || 'open',
    priority: issue.priority,
    type: issue.type,
    dueDate: issue.dueDate?.toISOString() || null,
    project: issue.project?.name || 'Unknown',
  }));
}

async function getWorkspaceInfo(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });
  return workspace;
}

async function getProjects(workspaceId: string) {
  const projects = await prisma.project.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    select: {
      id: true,
      name: true,
      issuePrefix: true,
      _count: {
        select: { issues: true },
      },
    },
  });

  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    identifier: p.issuePrefix || p.name.substring(0, 3).toUpperCase(),
    issueCount: p._count.issues,
  }));
}

export default async function DashboardPage() {
  const session = await getAuthSession();

  if (!session?.user) {
    redirect("/login");
  }

  let workspaceId = "";
  try {
    workspaceId = await verifyWorkspaceAccess(session.user);
  } catch (error) {
    console.error("Error verifying workspace access:", error);
    redirect("/welcome");
  }

  const [priorityIssues, workspace, projects] = await Promise.all([
    getPriorityIssues(session.user.id, workspaceId),
    getWorkspaceInfo(workspaceId),
    getProjects(workspaceId),
  ]);

  return (
    <DashboardClient
      user={{
        id: session.user.id,
        name: session.user.name || 'there',
        email: session.user.email || '',
      }}
      workspace={workspace}
      workspaceId={workspaceId}
      priorityIssues={priorityIssues}
      projects={projects}
    />
  );
}
