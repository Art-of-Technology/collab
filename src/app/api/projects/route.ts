import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  workspaceId: z.string(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace ID is required" }, { status: 400 });
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
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
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

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, workspaceId } = createProjectSchema.parse(body);

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
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Check if project name already exists in this workspace
    const existingProject = await prisma.project.findFirst({
      where: {
        name,
        orgId: workspaceId,
      }
    });

    if (existingProject) {
      return NextResponse.json(
        { error: "Project with this name already exists in this workspace" },
        { status: 400 }
      );
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

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error("Error creating project:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}