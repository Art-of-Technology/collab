import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = params;

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
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error("Error fetching project:", error);
    return NextResponse.json(
      { error: "Failed to fetch project" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = params;
    const body = await request.json();
    const updates = updateProjectSchema.parse(body);

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
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // If name is being updated, check for duplicates
    if (updates.name && updates.name !== existingProject.name) {
      const nameExists = await prisma.project.findFirst({
        where: {
          name: updates.name,
          orgId: existingProject.orgId,
          id: { not: projectId },
        }
      });

      if (nameExists) {
        return NextResponse.json(
          { error: "Project with this name already exists in this workspace" },
          { status: 400 }
        );
      }
    }

    // Update the project
    const project = await prisma.project.update({
      where: { id: projectId },
      data: updates,
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

    return NextResponse.json({ project });
  } catch (error) {
    console.error("Error updating project:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = params;

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
      return NextResponse.json(
        { error: "Project not found or you don't have permission to delete it" },
        { status: 404 }
      );
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
      return NextResponse.json(
        {
          error: "Cannot delete project with associated tasks, epics, milestones, stories, or board connections. Please remove or reassign them first.",
          details: {
            tasks: project._count.tasks,
            epics: project._count.epics,
            milestones: project._count.milestones,
            stories: project._count.stories,
            boardConnections: project._count.boardProjects,
          }
        },
        { status: 400 }
      );
    }

    // Delete the project
    await prisma.project.delete({
      where: { id: projectId },
    });

    return NextResponse.json({ message: "Project deleted successfully" });
  } catch (error) {
    console.error("Error deleting project:", error);
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 }
    );
  }
}