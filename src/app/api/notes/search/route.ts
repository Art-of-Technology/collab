import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NoteScope, NoteType } from "@prisma/client";

// Strip HTML tags for excerpt generation
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

// Generate excerpt around search term
function generateExcerpt(content: string, query: string, maxLength: number = 150): string {
  const plainText = stripHtml(content);
  const lowerText = plainText.toLowerCase();
  const lowerQuery = query.toLowerCase();

  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) {
    // If query not found in content, return start of text
    return plainText.length > maxLength
      ? plainText.substring(0, maxLength) + "..."
      : plainText;
  }

  // Calculate start position to center the match
  const halfLength = Math.floor(maxLength / 2);
  let start = Math.max(0, index - halfLength);
  let end = Math.min(plainText.length, start + maxLength);

  // Adjust start if we're near the end
  if (end - start < maxLength) {
    start = Math.max(0, end - maxLength);
  }

  let excerpt = plainText.substring(start, end);

  // Add ellipsis if needed
  if (start > 0) excerpt = "..." + excerpt;
  if (end < plainText.length) excerpt = excerpt + "...";

  return excerpt;
}

// GET /api/notes/search - Full-text search for notes
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");
    const workspaceId = searchParams.get("workspaceId");
    const projectId = searchParams.get("projectId");
    const type = searchParams.get("type") as NoteType | null;
    const scope = searchParams.get("scope") as NoteScope | null;
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const offset = parseInt(searchParams.get("offset") || "0");

    if (!q || q.trim().length < 2) {
      return NextResponse.json(
        { error: "Search query must be at least 2 characters" },
        { status: 400 }
      );
    }

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace ID is required" },
        { status: 400 }
      );
    }

    const searchQuery = q.trim();

    // Build access conditions - user can only search notes they have access to
    const accessConditions: any[] = [
      // User's own notes
      { authorId: session.user.id },
      // Workspace-visible notes
      { scope: NoteScope.WORKSPACE, workspaceId },
      // Public notes
      { scope: NoteScope.PUBLIC },
      // Notes shared with the user
      { sharedWith: { some: { userId: session.user.id } } }
    ];

    // Add project access if projectId specified
    if (projectId) {
      accessConditions.push({ scope: NoteScope.PROJECT, projectId });
    }

    // Build the where clause
    const where: any = {
      AND: [
        // Access control
        { OR: accessConditions },
        // Workspace filter
        {
          OR: [
            { workspaceId },
            { workspaceId: null }
          ]
        },
        // Search condition - search in title and content
        {
          OR: [
            { title: { contains: searchQuery, mode: "insensitive" } },
            { content: { contains: searchQuery, mode: "insensitive" } }
          ]
        }
      ]
    };

    // Apply optional filters
    if (type) {
      where.AND.push({ type });
    }
    if (scope) {
      where.AND.push({ scope });
    }
    if (projectId) {
      where.AND.push({ projectId });
    }

    // Get total count for pagination
    const total = await prisma.note.count({ where });

    // Fetch matching notes
    const notes = await prisma.note.findMany({
      where,
      include: {
        author: {
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
        { updatedAt: "desc" }
      ],
      take: limit,
      skip: offset
    });

    // Transform results with excerpts and match scoring
    const results = notes.map(note => {
      const titleMatch = note.title.toLowerCase().includes(searchQuery.toLowerCase());
      const contentMatch = note.content.toLowerCase().includes(searchQuery.toLowerCase());

      // Simple scoring: title matches are weighted higher
      let matchScore = 0;
      if (titleMatch) matchScore += 2;
      if (contentMatch) matchScore += 1;

      return {
        id: note.id,
        title: note.title,
        type: note.type,
        scope: note.scope,
        excerpt: generateExcerpt(note.content, searchQuery),
        matchScore,
        isPinned: note.isPinned,
        author: note.author,
        project: note.project,
        tags: note.tags,
        updatedAt: note.updatedAt,
        createdAt: note.createdAt
      };
    });

    // Sort by match score (higher first)
    results.sort((a, b) => b.matchScore - a.matchScore);

    return NextResponse.json({
      results,
      total,
      hasMore: offset + limit < total,
      query: searchQuery
    });
  } catch (error) {
    console.error("Error searching notes:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
