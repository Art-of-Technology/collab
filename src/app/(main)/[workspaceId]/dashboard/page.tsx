import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { postWorkspaceAccessWhere } from "@/lib/post-access";
import { checkUserPermission, Permission } from "@/lib/permissions";
import { loadForgeBoard } from "@/lib/forge/board";
import { loadProjectMemory } from "@/lib/forge/memory-service";
import DashboardOverview, { type DashboardData } from "./components/DashboardClient";

export const metadata: Metadata = {
  title: "Project overview",
  description: "Project issues, approved memory and Ready review",
};

async function loadOverview(workspaceSelector: string, projectSelector: string | string[] | undefined): Promise<DashboardData | { kind: "login" }> {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return { kind: "login" };
    if (!workspaceSelector || workspaceSelector.length > 200 ||
      (projectSelector !== undefined && (typeof projectSelector !== "string" || projectSelector.length > 200))) return { kind: "denied" };
    const actorId = session.user.id;
    const workspace = await prisma.workspace.findFirst({
      where: postWorkspaceAccessWhere(actorId, workspaceSelector),
      select: { id: true, slug: true, name: true },
    });
    if (!workspace) return { kind: "denied" };
    const [issues, notes] = await Promise.all([
      checkUserPermission(actorId, workspace.id, Permission.VIEW_TASKS),
      checkUserPermission(actorId, workspace.id, Permission.VIEW_NOTES),
    ]);
    if (!issues.hasPermission && !notes.hasPermission) return { kind: "denied" };
    const projects = await prisma.project.findMany({
      where: { workspaceId: workspace.id, workspace: postWorkspaceAccessWhere(actorId) },
      select: { id: true, slug: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    const selected = projectSelector
      ? projects.find(project => project.id === projectSelector)
      : projects.length === 1 ? projects[0] : undefined;
    if (projectSelector && !selected) return { kind: "denied" };
    const workspaceSlug = workspace.slug || workspace.id;
    if (!selected) return { kind: "ready", workspaceName: workspace.name, workspaceSlug, projects, selected: null };
    // Recheck access on the selected payload; never use a cookie/global workspace fallback.
    const project = await prisma.project.findFirst({
      where: { id: selected.id, workspaceId: workspace.id, workspace: postWorkspaceAccessWhere(actorId) },
      select: { id: true, slug: true, name: true },
    });
    if (!project) return { kind: "denied" };
    const [board, memory] = await Promise.all([
      issues.hasPermission ? loadForgeBoard(workspaceSlug, project.slug).catch(() => ({ kind: "unavailable" as const, projectName: project.name })) : Promise.resolve({ kind: "denied" as const }),
      notes.hasPermission ? loadProjectMemory(workspaceSlug, project.slug).catch(() => ({ kind: "unavailable" as const, projectName: project.name })) : Promise.resolve({ kind: "denied" as const }),
    ]);
    return { kind: "ready", workspaceName: workspace.name, workspaceSlug, projects, selected: { project, board, memory } };
  } catch {
    return { kind: "unavailable" };
  }
}

export default async function DashboardPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ project?: string | string[] }>;
}) {
  const { workspaceId } = await params;
  const { project } = await searchParams;
  const data = await loadOverview(workspaceId, project);
  if (data.kind === "login") redirect("/login");
  if (data.kind === "denied") notFound();
  return <DashboardOverview data={data} />;
}
