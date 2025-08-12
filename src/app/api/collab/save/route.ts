import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { documentId, content } = await request.json();

    if (!documentId || content === undefined) {
      return NextResponse.json(
        { error: "Document ID and content are required" },
        { status: 400 }
      );
    }

    // Parse document ID to get entity type, ID, and field
    const match = documentId.match(/^(task|epic|story|milestone):([^:]+):(.+)$/);
    if (!match) {
      return NextResponse.json(
        { error: "Invalid document ID format" },
        { status: 400 }
      );
    }

    const [, type, entityId, field] = match;

    // Validate that the field is 'description' (for security)
    if (field !== 'description') {
      return NextResponse.json(
        { error: "Only description field is supported" },
        { status: 400 }
      );
    }

    let updateResult;

    // Update the appropriate entity based on type
    switch (type) {
      case 'task':
        // Check if user has permission to edit this task
        const task = await prisma.task.findUnique({
          where: { id: entityId },
          include: { 
            taskBoard: { 
              include: { workspace: true } 
            } 
          }
        });
        
        if (!task) {
          return NextResponse.json({ error: "Task not found" }, { status: 404 });
        }

        // Basic permission check (you might want to add more sophisticated checks)
        const workspaceMember = await prisma.workspaceMember.findFirst({
          where: {
            workspaceId: task.taskBoard.workspaceId,
            userId: session.user.id
          }
        });

        if (!workspaceMember) {
          return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        updateResult = await prisma.task.update({
          where: { id: entityId },
          data: { description: content },
          select: { id: true, description: true }
        });
        break;

      case 'epic':
        const epic = await prisma.epic.findUnique({
          where: { id: entityId },
          include: { workspace: true }
        });
        
        if (!epic) {
          return NextResponse.json({ error: "Epic not found" }, { status: 404 });
        }

        const epicMember = await prisma.workspaceMember.findFirst({
          where: {
            workspaceId: epic.workspaceId,
            userId: session.user.id
          }
        });

        if (!epicMember) {
          return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        updateResult = await prisma.epic.update({
          where: { id: entityId },
          data: { description: content },
          select: { id: true, description: true }
        });
        break;

      case 'story':
        const story = await prisma.story.findUnique({
          where: { id: entityId },
          include: { epic: { include: { workspace: true } } }
        });
        
        if (!story) {
          return NextResponse.json({ error: "Story not found" }, { status: 404 });
        }

        const storyMember = await prisma.workspaceMember.findFirst({
          where: {
            workspaceId: story.epic.workspaceId,
            userId: session.user.id
          }
        });

        if (!storyMember) {
          return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        updateResult = await prisma.story.update({
          where: { id: entityId },
          data: { description: content },
          select: { id: true, description: true }
        });
        break;

      case 'milestone':
        const milestone = await prisma.milestone.findUnique({
          where: { id: entityId },
          include: { workspace: true }
        });
        
        if (!milestone) {
          return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
        }

        const milestoneMember = await prisma.workspaceMember.findFirst({
          where: {
            workspaceId: milestone.workspaceId,
            userId: session.user.id
          }
        });

        if (!milestoneMember) {
          return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        updateResult = await prisma.milestone.update({
          where: { id: entityId },
          data: { description: content },
          select: { id: true, description: true }
        });
        break;

      default:
        return NextResponse.json(
          { error: "Unsupported entity type" },
          { status: 400 }
        );
    }

    console.log(`[API] Saved collaboration document ${documentId} by user ${session.user.id}`);

    return NextResponse.json({ 
      success: true, 
      message: "Document saved successfully",
      data: updateResult 
    });

  } catch (error) {
    console.error("[API] Error saving collaborative document:", error);
    return NextResponse.json(
      { error: "Failed to save document" },
      { status: 500 }
    );
  }
}