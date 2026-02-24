import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth/next';
import { authConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import ViewRenderer from '@/components/views/ViewRenderer';

interface DynamicViewPageProps {
  params: {
    workspaceId: string;
  };
  searchParams: {
    name?: string;
    displayType?: string;
    filters?: string;
    grouping?: string;
    sorting?: string;
    projects?: string;
  };
}

export default async function DynamicViewPage({ params, searchParams }: DynamicViewPageProps) {
  const session = await getServerSession(authConfig);

  if (!session?.user?.email) {
    notFound();
  }

  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const { workspaceId } = resolvedParams;

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

  // Parse URL params
  const viewName = resolvedSearchParams.name || 'Dynamic View';
  const displayType = (resolvedSearchParams.displayType?.toUpperCase() || 'LIST') as string;
  const groupingField = resolvedSearchParams.grouping || 'status';

  // Parse filters from URL
  let filters: Record<string, string[]> = {};
  if (resolvedSearchParams.filters) {
    try {
      filters = JSON.parse(decodeURIComponent(resolvedSearchParams.filters));
    } catch (e) {
      console.error('Failed to parse filters:', e);
    }
  }

  // Parse sorting from URL
  let sorting = { field: 'updatedAt', direction: 'desc' };
  if (resolvedSearchParams.sorting) {
    try {
      sorting = JSON.parse(decodeURIComponent(resolvedSearchParams.sorting));
    } catch (e) {
      console.error('Failed to parse sorting:', e);
    }
  }

  // Parse project IDs from URL
  let projectIds: string[] = [];
  if (resolvedSearchParams.projects) {
    try {
      projectIds = JSON.parse(decodeURIComponent(resolvedSearchParams.projects));
    } catch (e) {
      console.error('Failed to parse projects:', e);
    }
  }

  // Get all workspace projects if none specified
  const allProjects = await prisma.project.findMany({
    where: {
      workspaceId: workspace.id,
      isArchived: { not: true }
    },
    select: {
      id: true,
      name: true,
      slug: true,
      issuePrefix: true,
      statuses: {
        orderBy: { order: 'asc' }
      },
    }
  });

  // Use specified projects or all projects
  const targetProjectIds = projectIds.length > 0 ? projectIds : allProjects.map(p => p.id);
  const projects = projectIds.length > 0
    ? allProjects.filter(p => projectIds.includes(p.id))
    : allProjects;

  // Build issues query with dynamic filtering
  const issuesQuery: any = {
    where: {
      workspaceId: workspace.id,
      projectId: { in: targetProjectIds },
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

  // Apply dynamic filters
  if (filters && typeof filters === 'object') {
    const hasActiveFilters = Object.values(filters).some(
      filterValues => Array.isArray(filterValues) && filterValues.length > 0
    );

    if (hasActiveFilters) {
      Object.entries(filters).forEach(([filterKey, filterValues]) => {
        if (Array.isArray(filterValues) && filterValues.length > 0) {
          switch (filterKey) {
            case 'status':
              issuesQuery.where.OR = [
                ...(issuesQuery.where.OR || []),
                { statusId: { in: filterValues } },
                { statusValue: { in: filterValues } },
                // Also match by status name (case-insensitive)
                { projectStatus: { name: { in: filterValues, mode: 'insensitive' } } }
              ];
              break;
            case 'priority':
              // Handle "no-priority" special value
              if (filterValues.includes('no-priority')) {
                const otherPriorities = filterValues.filter(v => v !== 'no-priority');
                if (otherPriorities.length > 0) {
                  issuesQuery.where.OR = [
                    ...(issuesQuery.where.OR || []),
                    { priority: { in: otherPriorities } },
                    { priority: null }
                  ];
                } else {
                  issuesQuery.where.priority = null;
                }
              } else {
                issuesQuery.where.priority = { in: filterValues };
              }
              break;
            case 'type':
              issuesQuery.where.type = {
                in: filterValues.map(value => value.toUpperCase())
              };
              break;
            case 'assignee':
              // Handle "unassigned" special value
              if (filterValues.includes('unassigned')) {
                const otherAssignees = filterValues.filter(v => v !== 'unassigned');
                if (otherAssignees.length > 0) {
                  issuesQuery.where.OR = [
                    ...(issuesQuery.where.OR || []),
                    { assigneeId: { in: otherAssignees } },
                    { assigneeId: null }
                  ];
                } else {
                  issuesQuery.where.assigneeId = null;
                }
              } else {
                // Check if it's user IDs or names
                const isIds = filterValues.every(v => v.length > 20); // CUIDs are typically 25 chars
                if (isIds) {
                  issuesQuery.where.assigneeId = { in: filterValues };
                } else {
                  // Search by name
                  issuesQuery.where.assignee = {
                    name: { in: filterValues, mode: 'insensitive' }
                  };
                }
              }
              break;
            case 'reporter':
              issuesQuery.where.reporterId = { in: filterValues };
              break;
            case 'labels':
              if (filterValues.includes('no-labels')) {
                issuesQuery.where.labels = { none: {} };
              } else {
                issuesQuery.where.labels = {
                  some: { id: { in: filterValues } }
                };
              }
              break;
            case 'isOverdue':
              if (filterValues.includes('true')) {
                issuesQuery.where.dueDate = { lt: new Date() };
                issuesQuery.where.projectStatus = { isFinal: false };
              }
              break;
            case 'dueDate':
              if (filterValues.includes('overdue')) {
                issuesQuery.where.dueDate = { lt: new Date() };
              } else if (filterValues.includes('today')) {
                const today = new Date();
                const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
                issuesQuery.where.dueDate = { gte: startOfDay, lt: endOfDay };
              } else if (filterValues.includes('this-week')) {
                const today = new Date();
                const startOfWeek = new Date(today);
                startOfWeek.setDate(today.getDate() - today.getDay());
                const endOfWeek = new Date(startOfWeek);
                endOfWeek.setDate(startOfWeek.getDate() + 7);
                issuesQuery.where.dueDate = { gte: startOfWeek, lt: endOfWeek };
              }
              break;
            case 'updatedAt':
              const today = new Date();
              filterValues.forEach(filterValue => {
                if (filterValue === 'today') {
                  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                  issuesQuery.where.updatedAt = { gte: startOfDay };
                } else if (filterValue === 'last-7-days') {
                  const sevenDaysAgo = new Date(today);
                  sevenDaysAgo.setDate(today.getDate() - 7);
                  issuesQuery.where.updatedAt = { gte: sevenDaysAgo };
                } else if (filterValue === 'last-30-days') {
                  const thirtyDaysAgo = new Date(today);
                  thirtyDaysAgo.setDate(today.getDate() - 30);
                  issuesQuery.where.updatedAt = { gte: thirtyDaysAgo };
                }
              });
              break;
            case 'createdAt':
              filterValues.forEach(filterValue => {
                if (filterValue === 'today') {
                  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                  issuesQuery.where.createdAt = { gte: startOfDay };
                } else if (filterValue === 'last-7-days') {
                  const sevenDaysAgo = new Date(today);
                  sevenDaysAgo.setDate(today.getDate() - 7);
                  issuesQuery.where.createdAt = { gte: sevenDaysAgo };
                }
              });
              break;
          }
        }
      });
    }
  }

  const issues = await prisma.issue.findMany(issuesQuery);

  // Build virtual view data (not from DB)
  const viewData = {
    id: 'dynamic',
    slug: 'dynamic',
    name: viewName,
    description: 'AI-generated dynamic view',
    type: 'DYNAMIC',
    displayType: displayType,
    visibility: 'PERSONAL',
    color: '#8b5cf6', // Purple for AI-generated
    issueCount: issues.length,
    filters: filters,
    sorting: sorting,
    grouping: { field: groupingField },
    fields: ['Priority', 'Status', 'Assignee', 'DueDate'],
    layout: {
      showSubtasks: true,
      showLabels: true,
      showAssigneeAvatars: true
    },
    projects: projects.map(p => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      issuePrefix: p.issuePrefix,
      color: '#3b82f6',
      statuses: p.statuses,
    })),
    projectIds: targetProjectIds,
    isDefault: false,
    isFavorite: false,
    isDynamic: true, // Flag to indicate this is a dynamic view
    createdBy: user.id,
    ownerId: user.id,
    sharedWith: [],
    createdAt: new Date(),
    updatedAt: new Date()
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

export async function generateMetadata({ searchParams }: DynamicViewPageProps) {
  const resolvedSearchParams = await searchParams;
  const viewName = resolvedSearchParams.name || 'Dynamic View';

  return {
    title: `${viewName} - Dynamic View`,
    description: `AI-generated dynamic view: ${viewName}`
  };
}
