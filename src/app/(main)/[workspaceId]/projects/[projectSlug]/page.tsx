import { getServerSession } from "@/lib/request-session";
import { notFound, redirect } from "next/navigation";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceSlug } from "@/lib/slug-resolvers";
import { ProjectDashboard } from "./ProjectDashboard";
import { postWorkspaceAccessWhere } from "@/lib/post-access";
import { loadForgeBoard } from "@/lib/forge/board";
import { loadForgeIssueRights } from "@/lib/forge/issue-service";
import { readForgeBindings } from "@/lib/forge/reader";
import { ForgeBoardView } from "./board/ForgeBoardView";

interface ProjectPageProps {
  params: Promise<{
    workspaceId: string;
    projectSlug: string;
  }>;
  searchParams: Promise<{ tab?: string; view?: string }>;
}

export default async function ProjectPage({ params, searchParams }: ProjectPageProps) {
  const { workspaceId: workspaceSlugOrId, projectSlug } = await params;
  const session = await getServerSession(authConfig);

  if (!session?.user?.id) {
    redirect('/login');
  }

  // Resolve workspace slug/ID to actual workspace ID
  const workspaceId = await resolveWorkspaceSlug(workspaceSlugOrId, true);
  if (!workspaceId) {
    redirect('/');
  }

  // Verify user has access to workspace
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      ...postWorkspaceAccessWhere(session.user.id),
    },
    select: {
      id: true,
      slug: true,
    }
  });

  if (!workspace) {
    redirect('/');
  }

  // Fetch project by slug
  const project = await prisma.project.findFirst({
    where: {
      workspaceId,
      slug: projectSlug,
      workspace: postWorkspaceAccessWhere(session.user.id),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      color: true,
    }
  });

  if (!project) {
    redirect(`/${workspaceSlugOrId}/projects`);
  }

  const workspaceSlug = workspace.slug || workspaceSlugOrId;
  const { tab, view } = await searchParams;
  const bindings = tab === 'work' ? await readForgeBindings().catch(() => []) : [];
  const hasForge = bindings.some(binding => binding.workspaceId === workspaceId && binding.projectId === project.id);
  let forgeBoard;
  if (tab === 'work' && view === 'forge') {
    const workUrl = `/${workspaceSlug}/projects/${project.slug}?tab=work`;
    if (!hasForge) redirect(workUrl);
    const board = await loadForgeBoard(workspaceSlug, project.slug, { workspaceId, projectId: project.id });
    if (board.kind === 'denied') notFound();
    if (board.kind === 'not-connected') redirect(workUrl);
    const rights = await loadForgeIssueRights(workspaceSlug, project.slug);
    forgeBoard = <ForgeBoardView initial={board} rights={rights} workspaceSlug={workspaceSlug} projectSlug={project.slug} />;
  }

  return (
    <ProjectDashboard
      projectId={project.id}
      projectName={project.name}
      projectSlug={project.slug}
      projectDescription={project.description}
      projectColor={project.color}
      workspaceId={workspaceId}
      workspaceSlug={workspaceSlug}
      hasForge={hasForge}
      forgeBoard={forgeBoard}
    />
  );
}
