import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspace");

    // Get all tags that are either:
    // 1. Created by the current user, OR
    // 2. Used in public notes in the workspace (when workspace filtering is active)
    const where: any = {};
    
    if (workspaceId) {
      // When workspace is specified, show tags from current user OR public notes in workspace
      where.OR = [
        // Tags created by current user in this workspace
        { authorId: session.user.id, workspaceId },
        // Tags used in public notes in the workspace
        {
          workspaceId,
          notes: {
            some: {
              isPublic: true
            }
          }
        }
      ];
    } else {
      // When no workspace specified, show only user's own tags
      where.authorId = session.user.id;
    }

    const tags = await prisma.noteTag.findMany({
      where,
      include: {
        _count: {
          select: {
            notes: true
          }
        }
      },
      orderBy: {
        name: "asc"
      }
    });

    return NextResponse.json(tags);
  } catch (error) {
    console.error("Error fetching note tags:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, color, workspaceId } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Tag name is required" },
        { status: 400 }
      );
    }

    const tag = await prisma.noteTag.create({
      data: {
        name,
        color: color || "#6366F1",
        authorId: session.user.id,
        workspaceId: workspaceId || null
      },
      include: {
        _count: {
          select: {
            notes: true
          }
        }
      }
    });

    return NextResponse.json(tag, { status: 201 });
  } catch (error) {
    console.error("Error creating note tag:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 