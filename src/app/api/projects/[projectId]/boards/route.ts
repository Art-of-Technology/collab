import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const connectBoardSchema = z.object({
  boardId: z.string(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = params;
    const body = await request.json();
    const { boardId } = connectBoardSchema.parse(body);

    // Verify project exists and user has access
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        workspace: {
          OR: [
            { ownerId: session.user.id },
            { members: { some: { userId: session.user.id } } }
          ]
        }
      }
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Verify board exists and belongs to same workspace
    const board = await prisma.taskBoard.findFirst({
      where: {
        id: boardId,
        workspaceId: project.orgId,
      }
    });

    if (!board) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }

    // Check if connection already exists
    const existingConnection = await prisma.boardProject.findFirst({
      where: {
        boardId,
        projectId,
      }
    });

    if (existingConnection) {
      return NextResponse.json({ error: "Board is already connected to this project" }, { status: 400 });
    }

    // Create the connection
    const boardProject = await prisma.boardProject.create({
      data: {
        boardId,
        projectId,
      },
      include: {
        board: {
          select: {
            id: true,
            name: true,
            description: true,
          }
        },
        project: {
          select: {
            id: true,
            name: true,
          }
        }
      }
    });

    return NextResponse.json({ boardProject }, { status: 201 });
  } catch (error) {
    console.error("Error connecting board to project:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to connect board to project" },
      { status: 500 }
    );
  }
}