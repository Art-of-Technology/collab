import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

interface ProjectPageProps {
  params: {
    workspaceId: string;
    projectSlug: string;
  };
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const session = await getServerSession(authConfig);
  
  if (!session?.user?.id) {
    redirect('/auth/signin');
  }

  // Find the project by slug
  const project = await prisma.project.findFirst({
    where: {
      slug: (await params).projectSlug,
      workspaceId: (await params).workspaceId,
    },
  });

  if (!project) {
    redirect(`/${(await params).workspaceId}`);
  }

  // Find or create a default view for this project
  let defaultView = await prisma.view.findFirst({
    where: {
      projectIds: {
        has: project.id
      },
      isDefault: true,
      workspaceId: (await params).workspaceId,  
    },
  });

  // If no default view exists, create one
  if (!defaultView) {
    defaultView = await prisma.view.create({
      data: {
        name: `${project.name} Board`,
        description: `Default kanban view for ${project.name}`,
        workspaceId: (await params).workspaceId,
        ownerId: session.user.id,
        displayType: 'KANBAN',
        projectIds: [project.id],
        workspaceIds: [(await params).workspaceId],
        visibility: 'WORKSPACE',
        isDefault: true,

        filters: {},
        sorting: { field: 'position', direction: 'asc' },
        grouping: { field: 'status' },
        fields: ['title', 'status', 'priority', 'assignee', 'dueDate'],
        layout: {
          showSubtasks: true,
          showLabels: true,
          showAssigneeAvatars: true
        },
        sharedWith: []
      },
    });
  }

  // Redirect to the default view
  redirect(`/${(await params).workspaceId}/views/${defaultView.id}`);
}