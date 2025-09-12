import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// PUT /api/issues/[issueId]/comments/[commentId] - Update a comment
export async function PUT(
  request: NextRequest,
  { params }: { params: { issueId: string; commentId: string } }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const _params = await params;
    const issueId = _params.issueId;
    const commentId = _params.commentId;
    const { content, html } = await request.json();

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    // Resolve issue by key or id
    const isIssueKey = /^[A-Z]+[0-9]*-\d+$/.test(issueId);
    const issue = isIssueKey
      ? await prisma.issue.findFirst({ where: { issueKey: issueId }, select: { id: true, workspaceId: true } })
      : await prisma.issue.findUnique({ where: { id: issueId }, select: { id: true, workspaceId: true } });

    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    // Check if comment exists, belongs to the issue, and is owned by the current user
    const comment = await prisma.issueComment.findFirst({
      where: {
        id: commentId,
        issueId: issue.id,
      },
    });

    if (!comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    if (comment.authorId !== currentUser.id) {
      return NextResponse.json({ error: "You can only edit your own comments" }, { status: 403 });
    }

    // Access check: user must be in workspace
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: issue.workspaceId,
        OR: [
          { ownerId: currentUser.id },
          { members: { some: { userId: currentUser.id } } },
        ],
      },
    });

    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const updatedComment = await prisma.issueComment.update({
      where: { id: commentId },
      data: {
        content: content.trim(),
        html: html || null,
      },
      include: {
        author: { select: { id: true, name: true, image: true, useCustomAvatar: true } },
        reactions: {
          include: {
            author: { select: { id: true, name: true, image: true } }
          }
        },
      },
    });

    return NextResponse.json(updatedComment);
  } catch (error) {
    console.error("[ISSUE_COMMENT_UPDATE]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// DELETE /api/issues/[issueId]/comments/[commentId] - Delete a comment
export async function DELETE(
  request: NextRequest,
  { params }: { params: { issueId: string; commentId: string } }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const _params = await params;
    const issueId = _params.issueId;
    const commentId = _params.commentId;

    // Resolve issue by key or id
    const isIssueKey = /^[A-Z]+[0-9]*-\d+$/.test(issueId);
    const issue = isIssueKey
      ? await prisma.issue.findFirst({ where: { issueKey: issueId }, select: { id: true, workspaceId: true } })
      : await prisma.issue.findUnique({ where: { id: issueId }, select: { id: true, workspaceId: true } });

    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    // Check if comment exists, belongs to the issue, and is owned by the current user
    const comment = await prisma.issueComment.findFirst({
      where: {
        id: commentId,
        issueId: issue.id,
      },
      include: {
        replies: true, // Include replies to check if comment has children
      },
    });

    if (!comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    if (comment.authorId !== currentUser.id) {
      return NextResponse.json({ error: "You can only delete your own comments" }, { status: 403 });
    }

    // Access check: user must be in workspace
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: issue.workspaceId,
        OR: [
          { ownerId: currentUser.id },
          { members: { some: { userId: currentUser.id } } },
        ],
      },
    });

    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // If comment has replies, just mark it as deleted but keep the structure
    if (comment.replies && comment.replies.length > 0) {
      const deletedComment = await prisma.issueComment.update({
        where: { id: commentId },
        data: {
          content: "[deleted]",
          html: null,
        },
        include: {
          author: { select: { id: true, name: true, image: true, useCustomAvatar: true } },
          reactions: {
            include: {
              author: { select: { id: true, name: true, image: true } }
            }
          },
        },
      });

      return NextResponse.json({ 
        message: "Comment marked as deleted",
        comment: deletedComment
      });
    } else {
      // If no replies, completely delete the comment
      await prisma.issueComment.delete({
        where: { id: commentId },
      });

      return NextResponse.json({ 
        message: "Comment deleted successfully",
        deletedId: commentId
      });
    }
  } catch (error) {
    console.error("[ISSUE_COMMENT_DELETE]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
