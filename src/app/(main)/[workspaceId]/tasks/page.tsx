import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

interface TasksPageProps {
  params: {
    workspaceId: string;
  };
}

export default async function TasksPage({ params }: TasksPageProps) {
  const session = await getServerSession(authConfig);
  
  if (!session?.user?.id) {
    redirect('/auth/signin');
  }

  // Redirect to the first available view or create a default all-projects view
  let defaultView = await prisma.view.findFirst({
    where: {
      workspaceId: params.workspaceId,
      OR: [
        { visibility: 'WORKSPACE' },
        { visibility: 'SHARED' },
        { ownerId: session.user.id }
      ]
    },
    orderBy: [
      { isDefault: 'desc' },
      { isFavorite: 'desc' },
      { createdAt: 'asc' }
    ]
  });

  // If no views exist, create a default "All Issues" view
  if (!defaultView) {
    const allProjects = await prisma.project.findMany({
      where: { workspaceId: params.workspaceId },
      select: { id: true }
    });

    defaultView = await prisma.view.create({
      data: {
        name: 'All Issues',
        description: 'All issues across all projects',
        workspaceId: params.workspaceId,
        ownerId: session.user.id,
        displayType: 'KANBAN',
        projectIds: allProjects.map(p => p.id),
        workspaceIds: [params.workspaceId],
        visibility: 'WORKSPACE',
        isDefault: true,
        isFavorite: false,
        filters: {},
        sorting: { field: 'position', direction: 'asc' },
        grouping: { field: 'status' },
        fields: ['title', 'status', 'priority', 'assignee', 'dueDate'],
        layout: {
          showSubtasks: true,
          showLabels: true,
          showAssigneeAvatars: true
        },
        sharedWith: [],
        color: '#3b82f6'
      },
    });
  }

  redirect(`/${params.workspaceId}/views/${defaultView.id}`);
} 