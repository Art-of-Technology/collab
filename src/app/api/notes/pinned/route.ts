import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NoteScope } from "@prisma/client";

// GET /api/notes/pinned - Get pinned notes for a workspace/project
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    const projectId = searchParams.get("projectId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 20);

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace ID is required" },
        { status: 400 }
      );
    }

    // Build access conditions - user can only see pinned notes they have access to
    const accessConditions: any[] = [
      // User's own pinned notes
      { authorId: session.user.id },
      // Workspace-visible pinned notes
      { scope: NoteScope.WORKSPACE, workspaceId },
      // Public pinned notes
      { scope: NoteScope.PUBLIC },
      // Pinned notes shared with the user
      { sharedWith: { some: { userId: session.user.id } } }
    ];

    // Add project access if projectId specified
    if (projectId) {
      accessConditions.push({ scope: NoteScope.PROJECT, projectId });
    }

    // Build the where clause
    const where: any = {
      isPinned: true,
      AND: [
        // Access control
        { OR: accessConditions },
        // Workspace filter
        {
          OR: [
            { workspaceId },
            { workspaceId: null }
          ]
        }
      ]
    };

    // Apply project filter if specified
    if (projectId) {
      where.AND.push({
        OR: [
          { projectId },
          { projectId: null, scope: { not: NoteScope.PROJECT } }
        ]
      });
    }

    // Fetch pinned notes
    const pinnedNotes = await prisma.note.findMany({
      where,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true
          }
        },
        pinnedByUser: {
          select: {
            id: true,
            name: true,
            image: true
          }
        },
        project: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        tags: true
      },
      orderBy: [
        { pinnedAt: "desc" }
      ],
      take: limit
    });

    return NextResponse.json(pinnedNotes);
  } catch (error) {
    console.error("Error fetching pinned notes:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
