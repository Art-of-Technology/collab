import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function POST(
  req: Request,
  { params }: { params: { taskId: string; commentId: string } }
) {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    
    const { taskId, commentId } = params;
    
    // Check if comment exists and belongs to the task
    const comment = await prisma.taskComment.findFirst({
      where: {
        id: commentId,
        taskId: taskId,
      },
    });
    
    if (!comment) {
      return new NextResponse("Comment not found", { status: 404 });
    }
    
    // Check if user has access to the task's workspace
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { workspaceId: true },
    });

    if (!task) {
      return new NextResponse("Task not found", { status: 404 });
    }

    const hasAccess = await prisma.workspaceMember.findFirst({
      where: {
        userId: user.id,
        workspaceId: task.workspaceId,
      },
    });

    if (!hasAccess) {
      return new NextResponse("Access denied", { status: 403 });
    }
    
    // Check if the user already liked this comment
    const existingReaction = await prisma.taskCommentReaction.findFirst({
      where: {
        taskCommentId: commentId,
        authorId: user.id,
        type: "LIKE"
      },
    });
    
    // If reaction exists, remove it (toggle off)
    if (existingReaction) {
      await prisma.taskCommentReaction.delete({
        where: { id: existingReaction.id },
      });
      
      // Return the updated comment with reactions
      const updatedComment = await prisma.taskComment.findUnique({
        where: { id: commentId },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              image: true
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
          }
        }
      });
      
      return NextResponse.json({ 
        status: "removed",
        message: "Like removed",
        comment: updatedComment
      });
    }
    
    // Otherwise, create the reaction (toggle on)
    await prisma.taskCommentReaction.create({
      data: {
        type: "LIKE",
        taskCommentId: commentId,
        authorId: user.id,
      },
    });
    
    // Return the updated comment with reactions
    const updatedComment = await prisma.taskComment.findUnique({
      where: { id: commentId },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true
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
        }
      }
    });
    
    return NextResponse.json({ 
      status: "added",
      message: "Like added",
      comment: updatedComment
    });
    
  } catch (error) {
    console.error("Task comment like error:", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function GET(
  req: Request,
  { params }: { params: { taskId: string; commentId: string } }
) {
  try { 
    const { commentId } = params;
    
    const likes = await prisma.taskCommentReaction.findMany({
      where: {
        taskCommentId: commentId,
        type: "LIKE"
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
    
    return NextResponse.json({ likes });
  } catch (error) {
    console.error("Get task comment likes error:", error);
    return new NextResponse("Internal error", { status: 500 });
  }
} 