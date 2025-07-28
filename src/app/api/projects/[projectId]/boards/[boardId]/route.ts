import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { projectId: string; boardId: string } }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId, boardId } = params;

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

    // Find and delete the connection
    const boardProject = await prisma.boardProject.findFirst({
      where: {
        boardId,
        projectId,
      }
    });

    if (!boardProject) {
      return NextResponse.json({ error: "Board connection not found" }, { status: 404 });
    }

    await prisma.boardProject.delete({
      where: {
        id: boardProject.id,
      }
    });

    return NextResponse.json({ message: "Board disconnected from project successfully" });
  } catch (error) {
    console.error("Error disconnecting board from project:", error);
    return NextResponse.json(
      { error: "Failed to disconnect board from project" },
      { status: 500 }
    );
  }
}