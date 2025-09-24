import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { isIssueKey } from "@/lib/shared-issue-key-utils";

export async function POST(
  req: Request,
  { params }: { params: { issueId: string; commentId: string } }
) {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const _params = await params;
    const issueId = _params.issueId;
    const commentId = _params.commentId;
    
    // Resolve issue by key or id
    const issue = isIssueKey(issueId)
      ? await prisma.issue.findFirst({ where: { issueKey: issueId }, select: { id: true, workspaceId: true } })
      : await prisma.issue.findUnique({ where: { id: issueId }, select: { id: true, workspaceId: true } });

    if (!issue) {
      return new NextResponse("Issue not found", { status: 404 });
    }

    // Check if comment exists and belongs to the issue
    const comment = await prisma.issueComment.findFirst({
      where: {
        id: commentId,
        issueId: issue.id,
      },
    });
    
    if (!comment) {
      return new NextResponse("Comment not found", { status: 404 });
    }

    // Access check: user must be in workspace
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: issue.workspaceId,
        OR: [
          { ownerId: user.id },
          { members: { some: { userId: user.id } } },
        ],
      },
    });

    if (!hasAccess) {
      return new NextResponse("Access denied", { status: 403 });
    }
    
    // Check if the user already liked this comment
    const existingReaction = await prisma.issueCommentReaction.findFirst({
      where: {
        commentId,
        authorId: user.id,
        type: "like"
      },
    });
    
    // If reaction exists, remove it (toggle off)
    if (existingReaction) {
      await prisma.issueCommentReaction.delete({
        where: { id: existingReaction.id },
      });
      
      // Return the updated comment with reactions
      const updatedComment = await prisma.issueComment.findUnique({
        where: { id: commentId },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              image: true,
              useCustomAvatar: true
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
    await prisma.issueCommentReaction.create({
      data: {
        type: "like",
        commentId,
        authorId: user.id,
      },
    });
    
    // Return the updated comment with reactions
    const updatedComment = await prisma.issueComment.findUnique({
      where: { id: commentId },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
            useCustomAvatar: true
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
    console.error("Issue comment like error:", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
