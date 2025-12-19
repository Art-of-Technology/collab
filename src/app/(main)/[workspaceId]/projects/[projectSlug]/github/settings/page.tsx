import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceSlug } from "@/lib/slug-resolvers";
import { GitHubSettingsClient } from "./GitHubSettingsClient";

interface GitHubSettingsPageProps {
  params: Promise<{
    workspaceId: string;
    projectSlug: string;
  }>;
}

export default async function GitHubSettingsPage({ params }: GitHubSettingsPageProps) {
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

  // Fetch project with repository and statuses
  const project = await prisma.project.findFirst({
    where: {
      workspaceId,
      slug: projectSlug
    },
    include: {
      statuses: {
        orderBy: { order: 'asc' },
      },
      repository: {
        include: {
          branches: {
            orderBy: { createdAt: 'desc' },
            take: 50,
          },
          _count: {
            select: {
              commits: true,
              pullRequests: true,
              versions: true,
              releases: true,
              branches: true,
            }
          }
        }
      },
    }
  });

  if (!project) {
    redirect(`/${workspaceSlugOrId}/projects`);
  }

  // Transform project statuses for client
  const statuses = project.statuses.map(s => ({
    id: s.id,
    name: s.displayName || s.name,
    color: s.color,
    order: s.order,
    isDefault: s.isDefault,
  }));

  // Transform repository data for client
  const repositoryData = project.repository ? {
    id: project.repository.id,
    fullName: project.repository.fullName,
    owner: project.repository.owner,
    name: project.repository.name,
    defaultBranch: project.repository.defaultBranch || undefined,
    developmentBranch: project.repository.developmentBranch || undefined,
    versioningStrategy: project.repository.versioningStrategy,
    branchEnvironmentMap: project.repository.branchEnvironmentMap as Record<string, string> || {},
    issueTypeMapping: project.repository.issueTypeMapping as Record<string, string> || {},
    webhookId: project.repository.webhookId,
    webhookSecret: project.repository.webhookSecret,
    syncedAt: project.repository.syncedAt?.toISOString() || null,
    branches: project.repository.branches.map(b => ({
      id: b.id,
      name: b.name,
      headSha: b.headSha,
      isDefault: b.isDefault,
      isProtected: b.isProtected,
      createdAt: b.createdAt.toISOString(),
    })),
    _count: project.repository._count,
  } : null;

  return (
    <GitHubSettingsClient
      project={{
        id: project.id,
        name: project.name,
        slug: project.slug,
        issuePrefix: project.issuePrefix,
        statuses,
      }}
      repository={repositoryData}
      workspaceSlug={workspaceSlugOrId}
    />
  );
}
