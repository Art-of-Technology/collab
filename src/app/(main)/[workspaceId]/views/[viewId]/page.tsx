import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth/next';
import { authConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import ViewRenderer from '@/components/views/ViewRenderer';

interface ViewPageProps {
  params: {
    workspaceId: string;
    viewId: string; // Now interpreted as viewSlug
  };
}

export default async function ViewPage({ params }: ViewPageProps) {
  const session = await getServerSession(authConfig);
  
  if (!session?.user?.email) {
    notFound();
  }

  const resolvedParams = await params;
  const { workspaceId, viewId: viewSlug } = resolvedParams;

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

  // Fetch view with access control using slug
  const view = await prisma.view.findFirst({
    where: {
      slug: viewSlug,
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
      issuePrefix: true,
      statuses: {
        orderBy: {
          order: 'asc'
        }
      },
    }
  });

  // Build issues query with proper filtering
  const issuesQuery: any = {
    where: {
      workspaceId: workspace.id,
      // Apply project filter if specified
      ...(view.projectIds.length > 0 && {
        projectId: { in: view.projectIds }
      }),
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
          statusValue: true
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

  // Apply view filters (only if filters exist and are not empty)
  if (view.filters && typeof view.filters === 'object') {
    const filters = view.filters as Record<string, string[]>;
    
    // Only apply filters if there are actual filter values
    const hasActiveFilters = Object.values(filters).some(
      filterValues => Array.isArray(filterValues) && filterValues.length > 0
    );
    
    if (hasActiveFilters) {
      Object.entries(filters).forEach(([filterKey, filterValues]) => {
        if (Array.isArray(filterValues) && filterValues.length > 0) {
          switch (filterKey) {
            case 'status':
              // Use statusValue for backward compatibility (issues use this field)
              issuesQuery.where.statusValue = { in: filterValues };
              break;
            case 'priority':
              issuesQuery.where.priority = { in: filterValues };
              break;
            case 'type':
              issuesQuery.where.type = {
                in: filterValues.map(value => value.toUpperCase())
              };
              break;
            case 'assignee':
              issuesQuery.where.assigneeId = { in: filterValues };
              break;
            case 'reporter':
              issuesQuery.where.reporterId = { in: filterValues };
              break;
            case 'dueDate':
              // Handle date filters
              if (filterValues.includes('Overdue')) {
                issuesQuery.where.dueDate = { lt: new Date() };
              } else if (filterValues.includes('Due Today')) {
                const today = new Date();
                const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
                issuesQuery.where.dueDate = { gte: startOfDay, lt: endOfDay };
              }
              break;
            case 'updatedAt':
              // Handle updatedAt filters
              const updatedAtConditions: any[] = [];
              
              filterValues.forEach(filterValue => {
                const today = new Date();
                
                if (filterValue === 'today') {
                  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
                  updatedAtConditions.push({
                    updatedAt: { gte: startOfDay, lt: endOfDay }
                  });
                } else if (filterValue === 'yesterday') {
                  const yesterday = new Date(today);
                  yesterday.setDate(today.getDate() - 1);
                  const startOfYesterday = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
                  const endOfYesterday = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate() + 1);
                  updatedAtConditions.push({
                    updatedAt: { gte: startOfYesterday, lt: endOfYesterday }
                  });
                } else if (filterValue === 'last-3-days') {
                  const threeDaysAgo = new Date(today);
                  threeDaysAgo.setDate(today.getDate() - 3);
                  const startOfThreeDaysAgo = new Date(threeDaysAgo.getFullYear(), threeDaysAgo.getMonth(), threeDaysAgo.getDate());
                  updatedAtConditions.push({
                    updatedAt: { gte: startOfThreeDaysAgo }
                  });
                } else if (filterValue === 'last-7-days') {
                  const sevenDaysAgo = new Date(today);
                  sevenDaysAgo.setDate(today.getDate() - 7);
                  const startOfSevenDaysAgo = new Date(sevenDaysAgo.getFullYear(), sevenDaysAgo.getMonth(), sevenDaysAgo.getDate());
                  updatedAtConditions.push({
                    updatedAt: { gte: startOfSevenDaysAgo }
                  });
                } else if (filterValue === 'last-30-days') {
                  const thirtyDaysAgo = new Date(today);
                  thirtyDaysAgo.setDate(today.getDate() - 30);
                  const startOfThirtyDaysAgo = new Date(thirtyDaysAgo.getFullYear(), thirtyDaysAgo.getMonth(), thirtyDaysAgo.getDate());
                  updatedAtConditions.push({
                    updatedAt: { gte: startOfThirtyDaysAgo }
                  });
                } else if (filterValue.includes(':')) {
                  // Handle custom date range (format: "YYYY-MM-DD:YYYY-MM-DD")
                  try {
                    const [startStr, endStr] = filterValue.split(':');
                    const startDate = new Date(startStr + 'T00:00:00');
                    const endDate = new Date(endStr + 'T23:59:59');
                    
                    if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
                      updatedAtConditions.push({
                        updatedAt: { gte: startDate, lte: endDate }
                      });
                    }
                  } catch (error) {
                    console.warn('Invalid date range format:', filterValue);
                  }
                }
              });
              
              // If we have conditions, combine them with OR logic (union of all date ranges)
              if (updatedAtConditions.length > 0) {
                if (updatedAtConditions.length === 1) {
                  // Single condition, apply directly
                  Object.assign(issuesQuery.where, updatedAtConditions[0]);
                } else {
                  // Multiple conditions, use OR
                  if (!issuesQuery.where.OR) {
                    issuesQuery.where.OR = [];
                  }
                  issuesQuery.where.OR.push(...updatedAtConditions);
                }
              }
              break;
          }
        }
      });
    }
  }

  // Apply project filtering based on view configuration
  if (view.projectIds.length === 0) {
    // If no projects are specified in the view, include all workspace projects
    const workspaceProjects = await prisma.project.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true }
    });
    issuesQuery.where.projectId = { in: workspaceProjects.map(p => p.id) };
  } else {
    // If specific projects are specified, filter by those project IDs
    issuesQuery.where.projectId = { in: view.projectIds };
  }

  const issues = await prisma.issue.findMany(issuesQuery);

  // Transform view data with proper field mapping
  const viewData = {
    id: view.id,
    slug: view.slug,
    name: view.name,
    description: view.description || '',
    type: 'USER',
    displayType: view.displayType.toString(),
    visibility: view.visibility.toString(),
    color: view.color || '#3b82f6',
    issueCount: issues.length,
    filters: view.filters || {},
    sorting: (view.sorting as any) || { field: 'updatedAt', direction: 'desc' },
    grouping: (view.grouping as any) || { field: 'none' },
    fields: (view.fields as string[]) || ['Priority', 'Status', 'Assignee'],
    layout: (view.layout as any) || {
      showSubtasks: true,
      showLabels: true,
      showAssigneeAvatars: true
    },
    projects: projects.map(p => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      issuePrefix: p.issuePrefix,
      color: '#3b82f6', // Default color since Project model doesn't have color field
      statuses: p.statuses,
    })),
    isDefault: view.isDefault,
    isFavorite: view.isFavorite || false,
    createdBy: view.ownerId,
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
  const { workspaceId, viewId: viewSlug } = resolvedParams;
  
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
      slug: viewSlug,
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