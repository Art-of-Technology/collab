import { prisma } from '@/lib/prisma';

/**
 * Find the default view for a project
 */
export async function getDefaultViewForProject(projectId: string): Promise<{ id: string; slug: string | null; name: string } | null> {
  try {
    const defaultView = await prisma.view.findFirst({
      where: {
        projectIds: { has: projectId },
        isDefault: true
      },
      select: {
        id: true,
        slug: true,
        name: true
      }
    });
    
    return defaultView;
  } catch (error) {
    console.error('Error finding default view for project:', error);
    return null;
  }
}

/**
 * Find the default view for a project by project slug
 */
export async function getDefaultViewForProjectSlug(projectSlug: string, workspaceId: string): Promise<{ id: string; slug: string | null; name: string } | null> {
  try {
    // First find the project
    const project = await prisma.project.findFirst({
      where: {
        slug: projectSlug,
        workspaceId: workspaceId
      },
      select: {
        id: true
      }
    });

    if (!project) {
      return null;
    }

    // Then find its default view
    return await getDefaultViewForProject(project.id);
  } catch (error) {
    console.error('Error finding default view for project slug:', error);
    return null;
  }
}
