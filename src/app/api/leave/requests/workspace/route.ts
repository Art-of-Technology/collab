import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { checkUserPermission, Permission } from "@/lib/permissions";
import { resolveWorkspaceSlug } from "@/lib/slug-resolvers";

/**
 * GET /api/leave/requests/workspace?workspaceId=xxx - Get all leave requests for a workspace (managers only)
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const workspaceSlugOrId = url.searchParams.get("workspaceId");

    if (!workspaceSlugOrId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    // Resolve workspace slug to ID (supports both slugs and legacy UUIDs)
    const workspaceId = await resolveWorkspaceSlug(workspaceSlugOrId);

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get the current user
    const user = await prisma.user.findUnique({
      where: {
        email: session.user.email,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if workspace exists at all first
    const workspaceExists = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });

    if (!workspaceExists) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Check if user has access (following codebase pattern)
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }],
      },
      include: {
        members: {
          where: { userId: user.id },
          select: { role: true },
        },
      },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    // Check if user has permission to manage leave requests
    const isOwner = workspace.ownerId === user.id;
    const member = workspace.members[0];
    const isHROrAdmin =
      member && ["HR", "ADMIN", "OWNER"].includes(member.role);

    if (!isOwner && !isHROrAdmin) {
      return NextResponse.json(
        {
          error:
            "Insufficient permissions to view leave requests. Only workspace owners, admins, and HR personnel can view leave requests.",
        },
        { status: 403 }
      );
    }

    // Get all leave requests for the workspace
    const leaveRequests = await prisma.leaveRequest.findMany({
      where: {
        policy: {
          workspaceId: workspaceId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        policy: {
          select: {
            name: true,
            isPaid: true,
            trackIn: true,
          },
        },
      },
      orderBy: [
        {
          status: "asc", // Show pending first
        },
        {
          createdAt: "desc",
        },
      ],
    });

    // Transform the data to match our component interface
    const transformedRequests = leaveRequests.map((request) => ({
      ...request,
      user: {
        ...request.user,
        avatar: request.user.image,
      },
    }));

    return NextResponse.json(transformedRequests);
  } catch (error) {
    console.error("Error fetching workspace leave requests:", error);
    return NextResponse.json(
      { error: "Failed to fetch leave requests" },
      { status: 500 }
    );
  }
}
