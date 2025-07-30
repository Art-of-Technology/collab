import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth/next';
import { authConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import ViewRenderer from '@/components/views/ViewRenderer';

interface ViewPageProps {
  params: {
    workspaceId: string;
    viewId: string;
  };
}

export default async function ViewPage({ params }: ViewPageProps) {
  const session = await getServerSession(authConfig);
  
  if (!session?.user?.email) {
    notFound();
  }

  const resolvedParams = await params;
  const { workspaceId, viewId } = resolvedParams;

  // Get user
  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  });

  if (!user) {
    notFound();
  }

  // Get workspace by slug or ID and verify access
  const workspace = await prisma.workspace.findFirst({
    where: {
      OR: [
        { id: workspaceId },
        { slug: workspaceId }
      ],
      members: {
        some: {
          user: {
            email: session.user.email
          }
        }
      }
    },
    include: {
      members: {
        include: {
          user: true
        }
      }
    }
  });

  if (!workspace) {
    notFound();
  }

  // Fetch view with access control
  const view = await prisma.view.findFirst({
    where: {
      id: viewId,
      workspaceId: workspace.id,
      OR: [
        { visibility: 'WORKSPACE' },
        { visibility: 'SHARED', sharedWith: { has: user.id } },
        { visibility: 'PERSONAL', ownerId: user.id }
      ]
    },

  });

  if (!view) {
    notFound();
  }

  // Get projects info for the view
  const projects = await prisma.project.findMany({
    where: {
      id: { in: view.projectIds }
    },
    select: {
      id: true,
      name: true,
      slug: true,
      issuePrefix: true
    }
  });

  // Fetch issues based on view filters
  const issuesQuery: any = {
    where: {
      projectId: view.projectIds.length > 0 
        ? { in: view.projectIds }
        : undefined,
      // Apply filters from view
      ...(view.filters as any)
    },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          slug: true,
          issuePrefix: true,
          description: true
        }
      },
      assignee: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true
        }
      },
      reporter: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true
        }
      },
      labels: {
        select: {
          id: true,
          name: true,
          color: true
        }
      },
      parent: {
        select: {
          id: true,
          title: true,
          issueKey: true,
          type: true
        }
      },
      children: {
        select: {
          id: true,
          title: true,
          issueKey: true,
          type: true,
          status: true
        }
      },
      column: {
        select: {
          id: true,
          name: true,
          color: true,
          order: true
        }
      },
      _count: {
        select: {
          children: true,
          comments: true
        }
      }
    },
    orderBy: [
      { priority: 'desc' },
      { updatedAt: 'desc' }
    ]
  };

  // If no projects are specified, include all workspace projects
  if (view.projectIds.length === 0) {
    const workspaceProjects = await prisma.project.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true }
    });
    issuesQuery.where.projectId = { in: workspaceProjects.map(p => p.id) };
  }

  const issues = await prisma.issue.findMany(issuesQuery);

  // Transform view data
  const viewData = {
    id: view.id,
    name: view.name,
    description: view.description || '',
    type: 'USER', // Default type since schema doesn't have this field
    displayType: view.displayType.toString(),
    visibility: view.visibility.toString(),
    color: view.color || '#3b82f6',
    issueCount: 0, // TODO: Calculate issue count
    filters: view.filters,
    projects: projects.map(p => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      issuePrefix: p.issuePrefix,
      color: '#3b82f6' // Default project color
    })),
    isDefault: view.isDefault,
    isFavorite: view.isFavorite || false,
    createdBy: view.ownerId, // Map ownerId to createdBy for backward compatibility
    ownerId: view.ownerId,
    sharedWith: view.sharedWith,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt
  };

  return (
    <ViewRenderer
      view={viewData}
      issues={issues}
      workspace={workspace}
      currentUser={user}
    />
  );
}

export async function generateMetadata({ params }: ViewPageProps) {
  const resolvedParams = await params;
  const { workspaceId, viewId } = resolvedParams;
  
  // Get workspace by slug or ID first
  const workspace = await prisma.workspace.findFirst({
    where: {
      OR: [
        { id: workspaceId },
        { slug: workspaceId }
      ]
    }
  });

  if (!workspace) {
    return {
      title: 'View Not Found'
    };
  }

  const view = await prisma.view.findFirst({
    where: {
      id: viewId,
      workspaceId: workspace.id
    },
    include: {
      workspace: {
        select: {
          name: true
        }
      }
    }
  });

  if (!view) {
    return {
      title: 'View Not Found'
    };
  }

  return {
    title: `${view.name} - ${view.workspace.name}`,
    description: view.description || `${view.name} view in ${view.workspace.name}`
  };
} 