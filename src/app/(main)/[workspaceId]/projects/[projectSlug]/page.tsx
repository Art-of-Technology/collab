import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceSlug } from "@/lib/slug-resolvers";
import { ProjectDashboard } from "./ProjectDashboard";

interface ProjectPageProps {
  params: Promise<{
    workspaceId: string;
    projectSlug: string;
  }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { workspaceId: workspaceSlugOrId, projectSlug } = await params;
  const session = await getServerSession(authConfig);

  if (!session?.user?.email) {
    redirect('/login');
  }

  // Resolve workspace slug/ID to actual workspace ID
  const workspaceId = await resolveWorkspaceSlug(workspaceSlugOrId);
  if (!workspaceId) {
    redirect('/');
  }

  // Verify user has access to workspace
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      members: {
        some: {
          user: {
            email: session.user.email
          }
        }
      }
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
      slug: projectSlug
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
