import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function POST(
  req: Request,
  { params }: { params: { postId: string } }
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const _params = await params;
    const postId = await _params.postId;
    const body = await req.json();
    const { message, parentId } = body;

    if (!message || message.trim() === "") {
      return new NextResponse("Message is required", { status: 400 });
    }

    // Verify parentId references a valid comment if provided
    if (parentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parentId, postId },
      });

      if (!parentComment) {
        return new NextResponse("Parent comment not found", { status: 404 });
      }
    }

    // Create the comment
    const comment = await prisma.comment.create({
      data: {
        message,
        postId,
        authorId: user.id,
        parentId: parentId || null, // Explicitly set to null if not provided
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    });

    return NextResponse.json(comment);
  } catch (error) {
    console.error("Error creating comment:", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function GET(
  req: Request,
  { params }: { params: { postId: string } }
) {
  try {
    const _params = await params;
    const postId = await _params.postId;

    // First, get all top-level comments (those without a parent)
    const topLevelComments = await prisma.comment.findMany({
      where: {
        postId,
        parentId: null, // Only get comments without a parent
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        reactions: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
        },
      },
    });

    // Then, get all replies (comments with a parentId)
    const replies = await prisma.comment.findMany({
      where: {
        postId,
        NOT: {
          parentId: null, // Only get comments with a parent
        },
      },
      orderBy: {
        createdAt: 'asc', // Sort replies chronologically
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        reactions: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
        },
      },
    });

    // Group replies by their parentId for easier assignment
    const repliesByParentId = replies.reduce((acc, reply) => {
      const parentId = reply.parentId as string;
      if (!acc[parentId]) {
        acc[parentId] = [];
      }
      acc[parentId].push(reply);
      return acc;
    }, {} as Record<string, any[]>);

    // Attach replies to their parent comments
    const commentsWithReplies = topLevelComments.map(comment => ({
      ...comment,
      replies: repliesByParentId[comment.id] || [],
    }));

    return NextResponse.json({ comments: commentsWithReplies });
  } catch (error) {
    console.error("Error fetching comments:", error);
    return new NextResponse("Internal error", { status: 500 });
  }
} 