import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NoteScope } from "@prisma/client";
import { getVersion, compareVersions } from "@/lib/versioning";

/**
 * GET /api/notes/[id]/versions/compare?from=1&to=2
 * Compare two versions of a note
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
    const fromVersion = parseInt(searchParams.get('from') || '');
    const toVersion = parseInt(searchParams.get('to') || '');

    if (isNaN(fromVersion) || isNaN(toVersion)) {
      return NextResponse.json(
        { error: "Both 'from' and 'to' version numbers are required" },
        { status: 400 }
      );
    }

    if (fromVersion < 1 || toVersion < 1) {
      return NextResponse.json(
        { error: "Version numbers must be positive integers" },
        { status: 400 }
      );
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

    // Get both versions
    const [fromVersionRecord, toVersionRecord] = await Promise.all([
      getVersion(id, fromVersion),
      getVersion(id, toVersion),
    ]);

    if (!fromVersionRecord) {
      return NextResponse.json(
        { error: `Version ${fromVersion} not found` },
        { status: 404 }
      );
    }

    if (!toVersionRecord) {
      return NextResponse.json(
        { error: `Version ${toVersion} not found` },
        { status: 404 }
      );
    }

    // Compare content
    const contentDiff = compareVersions(
      fromVersionRecord.content,
      toVersionRecord.content
    );

    // Compare titles
    const titleChanged = fromVersionRecord.title !== toVersionRecord.title;

    return NextResponse.json({
      from: {
        version: fromVersionRecord.version,
        title: fromVersionRecord.title,
        author: fromVersionRecord.author,
        createdAt: fromVersionRecord.createdAt,
        changeType: fromVersionRecord.changeType,
      },
      to: {
        version: toVersionRecord.version,
        title: toVersionRecord.title,
        author: toVersionRecord.author,
        createdAt: toVersionRecord.createdAt,
        changeType: toVersionRecord.changeType,
      },
      diff: {
        titleChanged,
        oldTitle: titleChanged ? fromVersionRecord.title : undefined,
        newTitle: titleChanged ? toVersionRecord.title : undefined,
        content: contentDiff,
      },
    });
  } catch (error) {
    console.error("Error comparing versions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
