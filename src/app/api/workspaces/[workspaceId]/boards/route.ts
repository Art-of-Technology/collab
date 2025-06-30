import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { checkUserPermission, Permission } from "@/lib/permissions";

// GET /api/workspaces/[workspaceId]/boards - Get all boards for a workspace
export async function GET(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  const _params = await params;
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { workspaceId } = _params;

    // Check if the workspace exists and user is a member
    const workspace = await prisma.workspace.findUnique({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id } } }
        ]
      },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace not found or you don't have access" },
        { status: 404 }
      );
    }

    // Get all boards for the workspace
    const boards = await prisma.taskBoard.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(boards);
  } catch (error) {
    console.error("Error fetching boards:", error);
    return NextResponse.json(
      { error: "Failed to fetch boards" },
      { status: 500 }
    );
  }
}

// POST /api/workspaces/[workspaceId]/boards - Create a new board
export async function POST(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { workspaceId } = params;
    const body = await request.json();
    const { name, description, isDefault, issuePrefix } = body;

    // Required fields
    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    if (!issuePrefix || !issuePrefix.trim()) {
      return NextResponse.json(
        { error: "Issue prefix is required" },
        { status: 400 }
      );
    }

    // Check if user has permission to create boards in this workspace
    const hasPermission = await checkUserPermission(session.user.id, workspaceId, Permission.CREATE_BOARD);

    if (!hasPermission.hasPermission) {
      return NextResponse.json(
        { error: "You don't have permission to create boards in this workspace" },
        { status: 403 }
      );
    }

    // Check if the workspace exists and user is a member
    const workspace = await prisma.workspace.findUnique({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id } } }
        ]
      },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace not found or you don't have access" },
        { status: 404 }
      );
    }

    // Create board with default columns
    const board = await prisma.taskBoard.create({
      data: {
        name,
        description,
        issuePrefix,
        nextIssueNumber: 1, // Start issue numbering from 1
        isDefault: isDefault || false,
        workspaceId,
        columns: {
          create: [
            { name: "To Do", order: 0, color: "#6366F1" },
            { name: "In Progress", order: 1, color: "#EC4899" },
            { name: "Review", order: 2, color: "#F59E0B" },
            { name: "Done", order: 3, color: "#10B981" },
          ],
        },
      },
      include: {
        columns: {
          orderBy: { order: "asc" },
        },
      },
    });

    return NextResponse.json(board, { status: 201 });
  } catch (error) {
    console.error("Error creating board:", error);
    return NextResponse.json(
      { error: "Failed to create board" },
      { status: 500 }
    );
  }
} 