import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { tagId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tagId } = params;

    if (!tagId) {
      return NextResponse.json(
        { error: "Tag ID is required" },
        { status: 400 }
      );
    }

    // Check if tag exists and belongs to the user
    const existingTag = await prisma.noteTag.findFirst({
      where: {
        id: tagId,
        authorId: session.user.id
      },
      include: {
        _count: {
          select: {
            notes: true
          }
        }
      }
    });

    if (!existingTag) {
      return NextResponse.json(
        { error: "Tag not found" },
        { status: 404 }
      );
    }

    // Check if tag is used by any notes
    if (existingTag._count.notes > 0) {
      return NextResponse.json(
        { error: "Cannot delete tag that is used by notes" },
        { status: 400 }
      );
    }

    // Delete the tag
    await prisma.noteTag.delete({
      where: {
        id: tagId
      }
    });

    return NextResponse.json({ message: "Tag deleted successfully" });
  } catch (error) {
    console.error("Error deleting note tag:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 