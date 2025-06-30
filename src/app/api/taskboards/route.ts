import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { checkUserPermission } from "@/lib/permissions";
import { Permission } from "@/lib/permissions";

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
    const { name, slug, description, workspaceId, issuePrefix } = body;

    if (!name || !workspaceId) {
      return NextResponse.json(
        { message: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!slug) {
      return NextResponse.json(
        { message: "Slug is required" },
        { status: 400 }
      );
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json(
        { message: "Slug can only contain lowercase letters, numbers, and hyphens" },
        { status: 400 }
      );
    }

    if (!issuePrefix || !issuePrefix.trim()) {
      return NextResponse.json(
        { message: "Issue prefix is required" },
        { status: 400 }
      );
    }

    // Check if user has permission to create boards in this workspace
    const hasPermission = await checkUserPermission(currentUser.id, workspaceId, Permission.CREATE_BOARD);

    if (!hasPermission.hasPermission) {
      return NextResponse.json(
        { message: "You don't have permission to create boards in this workspace" },
        { status: 403 }
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
        slug,
        description,
        issuePrefix: issuePrefix.trim(),
        nextIssueNumber: 1,
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