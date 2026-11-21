import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import type { ComponentProps } from "react";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { postWorkspaceAccessWhere } from "@/lib/post-access";
import { issueReadAccessWhere } from "@/lib/issue-finder";
import { checkUserPermission, Permission } from "@/lib/permissions";
import { loadForgeBoard } from "@/lib/forge/board";
import { loadProjectMemory } from "@/lib/forge/memory-service";
import DashboardOverview, { type DashboardData } from "./components/DashboardClient";
import WorkspaceOverview from "./components/WorkspaceOverview";
import { loadWorkspaceIssueOverview } from "@/lib/dashboard/workspace-overview";
import { loadWorkspaceRepositoryOverview } from "@/lib/dashboard/repository-overview";
import { loadNeedsYou } from "@/lib/dashboard/needs-you";
import { loadAgentsNow } from "@/lib/dashboard/agents-now";
import { loadShipped } from "@/lib/dashboard/shipped";

export const metadata: Metadata = {
  title: "Workspace overview",
  description: "Project progress, issues needing attention and recent repository activity",
};

type OverviewSearch = Partial<Record<"project" | "scope" | "kind" | "q" | "dormant" | "page", string | string[]>>;
type WorkspaceData = { kind: "workspace"; overview: ComponentProps<typeof WorkspaceOverview> };

async function loadOverview(workspaceSelector: string, search: OverviewSearch): Promise<DashboardData | WorkspaceData | { kind: "login" }> {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return { kind: "login" };
    const projectSelector = search.project;
    if (!workspaceSelector || workspaceSelector.length > 200 ||
      (projectSelector !== undefined && (typeof projectSelector !== "string" || projectSelector.length > 200))) return { kind: "denied" };
    if (search.scope !== undefined && search.scope !== "all" && search.scope !== "mine") return { kind: "denied" };
    const { kind } = search;
    if (kind !== undefined && kind !== "question" && kind !== "review" && kind !== "failed" && kind !== "due") return { kind: "denied" };
    if (search.dormant !== undefined && search.dormant !== "1") return { kind: "denied" };
    if (search.q !== undefined && (typeof search.q !== "string" || search.q.length > 100)) return { kind: "denied" };
    if (search.page !== undefined && (typeof search.page !== "string" || !/^[1-9]\d{0,3}$/.test(search.page))) return { kind: "denied" };
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
    const issuesUnavailable = issues.reason === "Internal error";
    const notesUnavailable = notes.reason === "Internal error";
    if (!issues.hasPermission && !notes.hasPermission) return { kind: issuesUnavailable || notesUnavailable ? "unavailable" : "denied" };
    const workspaceSlug = workspace.slug || workspace.id;
    if (!projectSelector) {
      const scope = search.scope === "mine" ? "mine" : "all";
      const q = search.q?.trim() ?? "";
      const page = Number(search.page ?? 1);
      const dormant = search.dormant === "1";
      const viewer = { actorId, workspaceId: workspace.id };
      const startedAt = new Date();
      const unavailable = { kind: "unavailable" as const };
      const denied = { kind: "denied" as const };
      const [issueOverview, repositories, needsYou, agentsNow, shipped] = await Promise.all([
        issuesUnavailable ? unavailable : issues.hasPermission
          ? loadWorkspaceIssueOverview({ ...viewer, scope, projectSearch: q, projectPage: page, dormant })
          : denied,
        issuesUnavailable ? unavailable : issues.hasPermission ? loadWorkspaceRepositoryOverview(viewer) : denied,
        loadNeedsYou({ ...viewer, scope, kind }).catch(() => unavailable),
        loadAgentsNow(viewer).catch(() => unavailable),
        loadShipped(viewer).catch(() => unavailable),
      ]);
      return {
        kind: "workspace",
        overview: {
          workspaceSlug, scope, kind, q, dormant, page, updatedAt: startedAt.toISOString(),
          now: new Date().toISOString(), issues: issueOverview, repositories, needsYou, agentsNow, shipped,
        },
      };
    }
    const projects = await prisma.project.findMany({
      where: { workspaceId: workspace.id, workspace: postWorkspaceAccessWhere(actorId) },
      select: { id: true, slug: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    const selected = projects.find(project => project.id === projectSelector);
    if (!selected) return { kind: "denied" };
    // Recheck access on the selected payload; never use a cookie/global workspace fallback.
    const project = await prisma.project.findFirst({
      where: { id: selected.id, workspaceId: workspace.id, workspace: postWorkspaceAccessWhere(actorId) },
      select: { id: true, slug: true, name: true },
    });
    if (!project) return { kind: "denied" };
    const scope = { workspaceId: workspace.id, projectId: project.id };
    const [board, memory] = await Promise.all([
      issuesUnavailable ? { kind: "unavailable" as const, projectName: project.name } : issues.hasPermission ? loadForgeBoard(workspaceSlug, project.slug, scope).catch(() => ({ kind: "unavailable" as const, projectName: project.name })) : { kind: "denied" as const },
      notesUnavailable ? { kind: "unavailable" as const, projectName: project.name } : notes.hasPermission ? loadProjectMemory(workspaceSlug, project.slug, scope).catch(() => ({ kind: "unavailable" as const, projectName: project.name })) : { kind: "denied" as const },
    ]);
    let nativeIssues = null;
    if (board.kind === "not-connected") {
      const nativeProject = await prisma.project.findFirst({
        where: { id: project.id, workspaceId: workspace.id, workspace: postWorkspaceAccessWhere(actorId) },
        select: { issues: {
          where: { workspaceId: workspace.id, projectId: project.id, ...issueReadAccessWhere(actorId) },
          select: { id: true, issueKey: true, title: true },
          orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 5,
        } },
      });
      if (!nativeProject) return { kind: "denied" };
      nativeIssues = nativeProject.issues;
    }
    return { kind: "ready", workspaceName: workspace.name, workspaceSlug, projects, selected: { project, board, memory, nativeIssues } };
  } catch {
    return { kind: "unavailable" };
  }
}

export default async function DashboardPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<OverviewSearch>;
}) {
  const { workspaceId } = await params;
  const data = await loadOverview(workspaceId, await searchParams);
  if (data.kind === "login") redirect("/login");
  if (data.kind === "denied") notFound();
  if (data.kind === "workspace") return <WorkspaceOverview {...data.overview} />;
  return <DashboardOverview data={data} />;
}
