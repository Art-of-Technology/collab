import { getServerSession } from "@/lib/request-session";
import { redirect } from "next/navigation";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceSlug } from "@/lib/slug-resolvers";
import { ProjectDashboard } from "./ProjectDashboard";
import { postWorkspaceAccessWhere } from "@/lib/post-access";

interface ProjectPageProps {
  params: Promise<{
    workspaceId: string;
    projectSlug: string;
  }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
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

  return (
    <ProjectDashboard
      projectId={project.id}
      projectName={project.name}
      projectSlug={project.slug}
      projectDescription={project.description}
      projectColor={project.color}
      workspaceId={workspaceId}
      workspaceSlug={workspace.slug || workspaceSlugOrId}
    />
  );
}
