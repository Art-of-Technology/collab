import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// Helper function to organize comments into a tree structure
const organizeCommentsIntoTree = (comments: any[]) => {
  // Simplified approach - just return all comments with direct references
  // This is a temporary solution to debug the UI rendering
  const commentMap = new Map<string, any>();
  
  // First pass: create a map of all comments and initialize children arrays
  comments.forEach((comment: any) => {
    commentMap.set(comment.id, { ...comment, children: [] });
  });
  
  // Second pass: add children to their parents
  comments.forEach((comment: any) => {
    if (comment.parentId && commentMap.has(comment.parentId)) {
      const parent = commentMap.get(comment.parentId);
      parent.children.push(commentMap.get(comment.id));
    }
  });
  
  // Get root comments (those without parents or with non-existent parents)
  const rootComments = comments.filter(comment => {
    return !comment.parentId || !commentMap.has(comment.parentId);
  }).map(comment => commentMap.get(comment.id));
  
  console.log("API organizing comments (simplified):", { 
    totalComments: comments.length,
    rootComments: rootComments.length,
    commentMap: [...commentMap.entries()].map(([id, c]) => ({ 
      id, 
      parentId: c.parentId,
      hasChildren: (c.children && c.children.length > 0),
      childrenCount: c.children?.length || 0
    }))
  });
  
  return rootComments;
};

// Get all comments for a note
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

    // First check if the note exists and user has access to it
    const note = await prisma.note.findFirst({
      where: {
        id: id,
        OR: [
          { authorId: session.user.id },
          { isPublic: true }
        ]
      }
    });

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    // Get all comments for the note
    const comments = await prisma.comment.findMany({
      where: {
        // @ts-ignore - noteId already exists in schema
        noteId: id
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
            useCustomAvatar: true,
            avatarSkinTone: true,
            avatarEyes: true,
            avatarBrows: true,
            avatarMouth: true,
            avatarNose: true,
            avatarHair: true,
            avatarEyewear: true,
            avatarAccessory: true,
          }
        },
        reactions: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                image: true
              }
            }
          }
        },
        parent: true
      },
      orderBy: {
        createdAt: 'asc' // Changed to ascending order for better conversation flow
      }
    });
    
    console.log("Raw comments from database:", JSON.stringify(comments.map(c => ({
      id: c.id,
      parentId: c.parentId,
      message: c.message?.substring(0, 20) + "..."
    }))));
    
    // Organize comments into a tree structure
    const organizedComments = organizeCommentsIntoTree(comments);

    return NextResponse.json(organizedComments);
  } catch (error) {
    console.error("Error fetching note comments:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Create a new comment for a note
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { message, parentId, html } = body;

    // Check if the note exists and user has access to it
    const note = await prisma.note.findFirst({
      where: {
        id: id,
        OR: [
          { authorId: session.user.id },
          { isPublic: true }
        ]
      }
    });

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    // Create the comment
    const comment = await prisma.comment.create({
      data: {
        message,
        html,
        authorId: session.user.id,
        // @ts-ignore - noteId already exists in schema
        noteId: id,
        ...(parentId && { parentId })
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true
          }
        }
      }
    });

    return NextResponse.json(comment);
  } catch (error) {
    console.error("Error creating note comment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
