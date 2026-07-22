import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NoteScope, NoteSharePermission } from "@prisma/client";
import { getVersionHistory } from "@/lib/versioning";

/**
 * GET /api/notes/[id]/versions
 * Get version history for a note
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Check if user has access to this note
    const note = await prisma.note.findFirst({
      where: {
        id: id,
        OR: [
          { authorId: session.user.id },
          { scope: NoteScope.WORKSPACE },
          { scope: NoteScope.PROJECT },
          { scope: NoteScope.PUBLIC },
          { sharedWith: { some: { userId: session.user.id } } }
        ]
      },
      select: {
        id: true,
        version: true,
        versioningEnabled: true,
        authorId: true,
      }
    });

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    if (!note.versioningEnabled) {
      return NextResponse.json({
        versions: [],
        total: 0,
        hasMore: false,
        currentVersion: note.version,
        versioningEnabled: false,
      });
    }

    const { versions, total, hasMore } = await getVersionHistory(id, { limit, offset });

    return NextResponse.json({
      versions,
      total,
      hasMore,
      currentVersion: note.version,
      versioningEnabled: note.versioningEnabled,
    });
  } catch (error) {
    console.error("Error fetching version history:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
