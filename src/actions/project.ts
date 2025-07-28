"use server";

import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface CreateProjectData {
  name: string;
  description?: string;
  workspaceId: string;
}

export interface UpdateProjectData {
  name?: string;
  description?: string;
}

export async function getProjects(workspaceId: string) {
  const session = await getAuthSession();
  
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  // Check if user has access to the workspace
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      OR: [
        { ownerId: session.user.id },
        { members: { some: { userId: session.user.id } } }
      ]
    }
  });

  if (!workspace) {
    throw new Error('Access denied');
  }

  // Get projects for this workspace
  const projects = await prisma.project.findMany({
    where: {
      orgId: workspaceId,
    },
    include: {
      _count: {
        select: {
          tasks: true,
          epics: true,
          milestones: true,
          stories: true,
          boardProjects: true,
        }
      }
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return projects;
}

export async function getProject(projectId: string) {
  const session = await getAuthSession();
  
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  // Get project with access check
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      workspace: {
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id } } }
        ]
      }
    },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          slug: true,
        }
      },
      _count: {
        select: {
          tasks: true,
          epics: true,
          milestones: true,
          stories: true,
          boardProjects: true,
        }
      },
      boardProjects: {
        include: {
          board: {
            select: {
              id: true,
              name: true,
              description: true,
            }
          }
        }
      }
    },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  return project;
}

export async function createProject(data: CreateProjectData) {
  const session = await getAuthSession();
  
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  const { name, description, workspaceId } = data;

  // Check if user has access to the workspace
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      OR: [
        { ownerId: session.user.id },
        { members: { some: { userId: session.user.id } } }
      ]
    }
  });

  if (!workspace) {
    throw new Error('Access denied');
  }

  // Check if project name already exists in this workspace
  const existingProject = await prisma.project.findFirst({
    where: {
      name,
      orgId: workspaceId,
    }
  });

  if (existingProject) {
    throw new Error('Project with this name already exists in this workspace');
  }

  // Create the project
  const project = await prisma.project.create({
    data: {
      name,
      description,
      orgId: workspaceId,
    },
    include: {
      _count: {
        select: {
          tasks: true,
          epics: true,
          milestones: true,
          stories: true,
          boardProjects: true,
        }
      }
    },
  });

  return project;
}

export async function updateProject(projectId: string, data: UpdateProjectData) {
  const session = await getAuthSession();
  
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  // Check if project exists and user has access
  const existingProject = await prisma.project.findFirst({
    where: {
      id: projectId,
      workspace: {
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id } } }
        ]
      }
    },
  });

  if (!existingProject) {
    throw new Error('Project not found');
  }

  // If name is being updated, check for duplicates
  if (data.name && data.name !== existingProject.name) {
    const nameExists = await prisma.project.findFirst({
      where: {
        name: data.name,
        orgId: existingProject.orgId,
        id: { not: projectId },
      }
    });

    if (nameExists) {
      throw new Error('Project with this name already exists in this workspace');
    }
  }

  // Update the project
  const project = await prisma.project.update({
    where: { id: projectId },
    data: data,
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          slug: true,
        }
      },
      _count: {
        select: {
          tasks: true,
          epics: true,
          milestones: true,
          stories: true,
          boardProjects: true,
        }
      }
    },
  });

  return project;
}

export async function deleteProject(projectId: string) {
  const session = await getAuthSession();
  
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  // Check if project exists and user has access (only owners can delete projects)
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      workspace: {
        ownerId: session.user.id, // Only workspace owners can delete projects
      }
    },
    include: {
      _count: {
        select: {
          tasks: true,
          epics: true,
          milestones: true,
          stories: true,
          boardProjects: true,
        }
      }
    },
  });

  if (!project) {
    throw new Error('Project not found or you don\'t have permission to delete it');
  }

  // Check if project has associated data
  const hasAssociatedData = (
    project._count.tasks > 0 ||
    project._count.epics > 0 ||
    project._count.milestones > 0 ||
    project._count.stories > 0 ||
    project._count.boardProjects > 0
  );

  if (hasAssociatedData) {
    throw new Error('Cannot delete project with associated tasks, epics, milestones, stories, or board connections. Please remove or reassign them first.');
  }

  // Delete the project
  await prisma.project.delete({
    where: { id: projectId },
  });

  return { message: "Project deleted successfully" };
}