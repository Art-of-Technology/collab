import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NoteIncludeExtension } from '@/types/prisma-extensions';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const isFavorite = searchParams.get("favorite") === "true";
    const tagId = searchParams.get("tag");
    const workspaceId = searchParams.get("workspace");
    const isPublic = searchParams.get("public");
    const own = searchParams.get("own");

    // Build the base where clause
    const where: any = {
      ...(search && {
        OR: [
          { title: { contains: search, mode: "insensitive" as const } },
          { content: { contains: search, mode: "insensitive" as const } }
        ]
      }),
      ...(isFavorite && { isFavorite: true }),
      ...(tagId && { tags: { some: { id: tagId } } })
    };

    // Handle the new 5-category filtering system
    if (own === "true") {
      // User wants only their own notes
      where.authorId = session.user.id;
      
      if (isPublic === "true") {
        // My Public notes
        where.isPublic = true;
      } else if (isPublic === "false") {
        // My Private notes  
        where.isPublic = false;
      }
      // If no isPublic specified, show both (My Notes)
      
      // Apply workspace filter if specified
      if (workspaceId) {
        if (!where.AND) where.AND = [];
        where.AND.push({ workspaceId: workspaceId });
      }
    } else if (own === "false") {
      // Team Public - only public notes from others in the workspace
      if (workspaceId) {
        where.AND = [
          { isPublic: true },
          { authorId: { not: session.user.id } }, // Exclude user's own notes
          { workspaceId: workspaceId }
        ];
      } else {
        // If no workspace, show all public notes from others
        where.isPublic = true;
        where.authorId = { not: session.user.id };
      }
    } else {
      // All Notes - everything user has access to (own notes + others' public)
      if (workspaceId) {
        where.AND = [
          {
            OR: [
              { authorId: session.user.id }, // User's own notes (both public and private)
              { isPublic: true } // Others' public notes
            ]
          },
          { workspaceId: workspaceId }
        ];
      } else {
        where.OR = [
          { authorId: session.user.id }, // User's own notes (both public and private)
          { isPublic: true } // Others' public notes
        ];
      }
    }

    const notes = await prisma.note.findMany({
      where,
      include: {
        tags: true,
        author: {
          select: {
            id: true,
            name: true,
            image: true
          }
        },
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      } as NoteIncludeExtension,
      orderBy: {
        updatedAt: "desc"
      }
    });



    return NextResponse.json(notes);
  } catch (error) {
    console.error("Error fetching notes:", error);
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
    const { title, content, isPublic, isFavorite, workspaceId, tagIds } = body;

    if (!title || !content) {
      return NextResponse.json(
        { error: "Title and content are required" },
        { status: 400 }
      );
    }

    const note = await prisma.note.create({
      data: {
        title,
        content,
        isPublic: isPublic || false,
        isFavorite: isFavorite || false,
        authorId: session.user.id,
        workspaceId: workspaceId || null,
        ...(tagIds && tagIds.length > 0 && {
          tags: {
            connect: tagIds.map((id: string) => ({ id }))
          }
        })
      },
      include: {
        tags: true,
        author: {
          select: {
            id: true,
            name: true,
            image: true
          }
        },
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        comments: {
          select: {
            id: true
          }
        }
      } as NoteIncludeExtension
    });

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error("Error creating note:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 