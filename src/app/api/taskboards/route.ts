import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function GET(req: Request) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");
    const includeStats = searchParams.get("includeStats") === "true";

    // Build query
    const query: any = {};
    
    // Filter by workspace
    if (workspaceId) {
      // Verify the user has access to this workspace
      const hasAccess = await prisma.workspace.findFirst({
        where: {
          id: workspaceId,
          OR: [
            { ownerId: currentUser.id },
            { members: { some: { userId: currentUser.id } } }
          ]
        },
      });
      
      if (!hasAccess) {
        return NextResponse.json(
          { message: "You don't have access to this workspace" },
          { status: 403 }
        );
      }
      
      query.workspaceId = workspaceId;
    } else {
      // Get all workspaces the user has access to
      const accessibleWorkspaces = await prisma.workspace.findMany({
        where: {
          OR: [
            { ownerId: currentUser.id },
            { members: { some: { userId: currentUser.id } } }
          ]
        },
        select: { id: true }
      });
      
      if (accessibleWorkspaces.length === 0) {
        return NextResponse.json([]);
      }
      
      query.workspaceId = {
        in: accessibleWorkspaces.map(w => w.id)
      };
    }
    
    // Build include
    const include: any = {};
    
    if (includeStats) {
      include._count = {
        select: {
          tasks: true,
        }
      };
    }
    
    // Get the task boards
    const taskBoards = await prisma.taskBoard.findMany({
      where: query,
      include,
      orderBy: {
        createdAt: 'asc'
      }
    });
    
    return NextResponse.json(taskBoards);
  } catch (error) {
    console.error("Error fetching task boards:", error);
    return NextResponse.json(
      { message: "Error fetching task boards" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { name, description, workspaceId } = body;

    if (!name || !workspaceId) {
      return NextResponse.json(
        { message: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify the user has access to this workspace
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: currentUser.id },
          { members: { some: { userId: currentUser.id } } }
        ]
      },
    });
    
    if (!hasAccess) {
      return NextResponse.json(
        { message: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    // Create the board
    const taskBoard = await prisma.taskBoard.create({
      data: {
        name,
        description,
        workspaceId
      }
    });

    return NextResponse.json(taskBoard);
  } catch (error) {
    console.error("Error creating task board:", error);
    return NextResponse.json(
      { message: "Error creating task board" },
      { status: 500 }
    );
  }
} 