import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth/next';
import { authConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import ProjectDetailClient from './ProjectDetailClient';

interface ProjectPageProps {
  params: {
    workspaceId: string;
    projectSlug: string;
  };
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const session = await getServerSession(authConfig);
  
  if (!session?.user?.email) {
    notFound();
  }

  const resolvedParams = await params;
  const { workspaceId, projectSlug } = resolvedParams;

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

  // Get project by slug
  const project = await prisma.project.findFirst({
    where: {
      slug: projectSlug,
      workspaceId: workspace.id
    },
    include: {
      _count: {
        select: {
          issues: true
        }
      }
    }
  });

  if (!project) {
    notFound();
  }

  // Build issues query for this project
  const issuesQuery = {
    where: {
      workspaceId: workspace.id,
      projectId: project.id
    },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          slug: true,
          issuePrefix: true,
          description: true,
          color: true
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
      projectStatus: {
        select: {
          id: true,
          name: true,
          displayName: true,
          color: true,
          order: true,
          isDefault: true
        }
      },
      _count: {
        select: {
          children: true,
          comments: true
        }
      }
    }
  };

  const issues = await prisma.issue.findMany(issuesQuery);

  // Create a virtual view for this project
  const projectView = {
    id: `project-${project.id}`,
    slug: `project-${project.slug}`,
    name: project.name,
    description: project.description || `All issues in ${project.name}`,
    type: 'PROJECT',
    displayType: 'LIST',
    visibility: 'WORKSPACE',
    color: project.color || '#3b82f6',
    issueCount: issues.length,
    filters: {
      project: [project.id]
    },
    sorting: { field: 'updatedAt', direction: 'desc' },
    grouping: { field: 'status' },
    fields: ['ID', 'Priority', 'Status', 'Assignee', 'Due date', 'Updated'],
    layout: {
      showSubtasks: true,
      showLabels: true,
      showAssigneeAvatars: true
    },
    projects: [{
      id: project.id,
      name: project.name,
      slug: project.slug,
      issuePrefix: project.issuePrefix,
      color: project.color || '#3b82f6'
    }],
    isDefault: false,
    isFavorite: false,
    createdBy: user.id,
    ownerId: user.id,
    sharedWith: [],
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    projectIds: [project.id]
  };

  return (
    <ProjectDetailClient
      project={project}
      view={projectView}
      issues={issues}
      workspace={workspace}
      currentUser={user}
    />
  );
}

export async function generateMetadata({ params }: ProjectPageProps) {
  const resolvedParams = await params;
  const { workspaceId, projectSlug } = resolvedParams;
  
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
      title: 'Project Not Found'
    };
  }

  const project = await prisma.project.findFirst({
    where: {
      slug: projectSlug,
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

  if (!project) {
    return {
      title: 'Project Not Found'
    };
  }

  return {
    title: `${project.name} - ${project.workspace.name}`,
    description: project.description || `${project.name} project in ${project.workspace.name}`
  };
}