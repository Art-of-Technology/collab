import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// GET /api/notes/tags - List all tags for a workspace
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspace");

    const tags = await prisma.noteTag.findMany({
      where: {
        OR: [
          { authorId: session.user.id },
          ...(workspaceId ? [{ workspaceId }] : []),
        ],
      },
      include: {
        _count: {
          select: { notes: true },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(tags);
  } catch (error) {
    console.error("Error fetching tags:", error);
    return NextResponse.json(
      { error: "Failed to fetch tags" },
      { status: 500 }
    );
  }
}

// POST /api/notes/tags - Create a new tag
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, color, workspaceId } = body;

    if (!name?.trim()) {
      return NextResponse.json(
        { error: "Tag name is required" },
        { status: 400 }
      );
    }

    // Check if tag with same name already exists for this user/workspace
    const existingTag = await prisma.noteTag.findFirst({
      where: {
        name: name.trim(),
        authorId: session.user.id,
        workspaceId: workspaceId || null,
      },
    });

    if (existingTag) {
      return NextResponse.json(
        { error: "A tag with this name already exists" },
        { status: 409 }
      );
    }

    const tag = await prisma.noteTag.create({
      data: {
        name: name.trim(),
        color: color || "#6366F1",
        authorId: session.user.id,
        workspaceId: workspaceId || null,
      },
      include: {
        _count: {
          select: { notes: true },
        },
      },
    });

    return NextResponse.json(tag, { status: 201 });
  } catch (error) {
    console.error("Error creating tag:", error);
    return NextResponse.json(
      { error: "Failed to create tag" },
      { status: 500 }
    );
  }
}
