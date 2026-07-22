import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceSlug } from "@/lib/slug-resolvers";
import { GitHubDashboardClient } from "./GitHubDashboardClient";

interface GitHubPageProps {
  params: Promise<{
    workspaceId: string;
    projectSlug: string;
  }>;
}

export default async function GitHubPage({ params }: GitHubPageProps) {
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
    }
  });

  if (!workspace) {
    redirect('/');
  }

  // Fetch project with repository
  const project = await prisma.project.findFirst({
    where: {
      workspaceId,
      slug: projectSlug
    },
    include: {
      repository: {
        include: {
          branches: {
            take: 10,
            orderBy: { createdAt: 'desc' }
          },
          _count: {
            select: {
              commits: true,
              pullRequests: true,
              versions: true,
              releases: true,
            }
          }
        }
      },
    }
  });

  if (!project) {
    redirect(`/${workspaceSlugOrId}/projects`);
  }

  // Transform repository data for client
  const repositoryData = project.repository ? {
    id: project.repository.id,
    fullName: project.repository.fullName,
    owner: project.repository.owner,
    name: project.repository.name,
    defaultBranch: project.repository.defaultBranch || undefined,
    versioningStrategy: project.repository.versioningStrategy,
    developmentBranch: project.repository.developmentBranch || undefined,
    branches: project.repository.branches.map(b => ({
      id: b.id,
      name: b.name,
      headSha: b.headSha,
      createdAt: b.createdAt.toISOString(),
    })),
    _count: project.repository._count,
  } : null;

  return (
    <GitHubDashboardClient
      project={{
        id: project.id,
        name: project.name,
        slug: project.slug,
        issuePrefix: project.issuePrefix,
      }}
      repository={repositoryData}
      workspaceSlug={workspaceSlugOrId}
    />
  );
}
