import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { postWorkspaceAccessWhere } from "@/lib/post-access";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceSlug } from "@/lib/slug-resolvers";

interface ProjectNotesPageProps {
  params: Promise<{
    workspaceId: string;
    projectSlug: string;
  }>;
}

export default async function ProjectNotesPage({ params }: ProjectNotesPageProps) {
  const { workspaceId: workspaceSlugOrId, projectSlug } = await params;
  const user = await getCurrentUser();

  if (!user) {
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
      ...postWorkspaceAccessWhere(user.id)
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
      workspace: postWorkspaceAccessWhere(user.id)
    },
    select: {
      id: true,
    }
  });

  if (!project) {
    redirect(`/${workspaceSlugOrId}/projects`);
  }

  // A project's Notes are its level in Context. This address is kept for the links made to the old list.
  redirect(`/${workspace.slug}/context?project=${project.id}`);
}
