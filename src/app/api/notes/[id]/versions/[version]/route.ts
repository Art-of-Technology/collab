import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NoteScope } from "@prisma/client";
import { getVersion, restoreVersion, compareVersions } from "@/lib/versioning";

/**
 * GET /api/notes/[id]/versions/[version]
 * Get a specific version of a note
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, version: versionParam } = await params;
    const versionNumber = parseInt(versionParam);

    if (isNaN(versionNumber) || versionNumber < 1) {
      return NextResponse.json({ error: "Invalid version number" }, { status: 400 });
    }

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
      select: { id: true, versioningEnabled: true }
    });

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const versionRecord = await getVersion(id, versionNumber);

    if (!versionRecord) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    return NextResponse.json(versionRecord);
  } catch (error) {
    console.error("Error fetching version:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/notes/[id]/versions/[version]
 * Restore a note to a specific version
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, version: versionParam } = await params;
    const versionNumber = parseInt(versionParam);

    if (isNaN(versionNumber) || versionNumber < 1) {
      return NextResponse.json({ error: "Invalid version number" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const { comment } = body;

    // Check if user has edit access to this note
    const note = await prisma.note.findFirst({
      where: {
        id: id,
        OR: [
          { authorId: session.user.id },
          {
            sharedWith: {
              some: {
                userId: session.user.id,
                permission: 'EDIT'
              }
            }
          }
        ]
      },
      select: {
        id: true,
        versioningEnabled: true,
        version: true,
      }
    });

    if (!note) {
      return NextResponse.json(
        { error: "Note not found or no permission to edit" },
        { status: 404 }
      );
    }

    if (!note.versioningEnabled) {
      return NextResponse.json(
        { error: "Versioning is not enabled for this note" },
        { status: 400 }
      );
    }

    // Check target version exists
    const targetVersion = await getVersion(id, versionNumber);
    if (!targetVersion) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    // Restore the version
    const result = await restoreVersion(
      id,
      versionNumber,
      session.user.id,
      comment
    );

    // Update the note content to match the restored version
    await prisma.note.update({
      where: { id },
      data: {
        title: targetVersion.title,
        content: targetVersion.content,
      }
    });

    return NextResponse.json({
      message: `Note restored to version ${versionNumber}`,
      newVersion: result.version,
      versionId: result.id,
    });
  } catch (error) {
    console.error("Error restoring version:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
