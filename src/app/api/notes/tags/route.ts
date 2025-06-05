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

    const tags = await prisma.noteTag.findMany({
      where: {
        authorId: session.user.id,
        ...(workspaceId && { workspaceId })
      },
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