import { publishEvent } from '@/lib/redis';
import { assertLegacyIssueWriteAllowed, ForgeProjectWriteError } from '@/lib/forge/legacy-write-guard';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { findIssueByIdOrKey } from "@/lib/issue-finder";
import { notifyCommentMentions } from "@/lib/issue-comment-mentions";

// GET /api/issues/[issueId]/comments - Get all comments for an issue
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { issueId } = await params;

    // Resolve issue by key or id with workspace scoping
    const issue = await findIssueByIdOrKey(issueId, {
      userId: currentUser.id,
      select: { id: true, workspaceId: true }
    });

    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    // Access is already validated by findIssueByIdOrKey with userId

    const comments = await prisma.issueComment.findMany({
      where: { issueId: issue.id },
      include: {
        author: {
          select: { id: true, name: true, image: true, useCustomAvatar: true },
        },
        reactions: {
          include: {
            author: { select: { id: true, name: true, image: true } }
          }
        },
        replies: {
          include: {
            author: { select: { id: true, name: true, image: true, useCustomAvatar: true } },
            reactions: {
              include: {
                author: { select: { id: true, name: true, image: true } }
              }
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(comments);
  } catch (error) {
    console.error("[ISSUE_COMMENTS_GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/issues/[issueId]/comments - Create a new issue comment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { issueId } = await params;
    const { content, html, parentId } = await request.json();

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    // Resolve issue by key or id with workspace scoping
    const issue = await findIssueByIdOrKey(issueId, {
      userId: currentUser.id
    });

    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    // Access is already validated by findIssueByIdOrKey with userId

    await assertLegacyIssueWriteAllowed(issue.id);

    // Verify parentId belongs to this issue
    if (parentId) {
      const parent = await prisma.issueComment.findFirst({ where: { id: parentId, issueId: issue.id } });
      if (!parent) {
        return NextResponse.json({ error: "Parent comment not found" }, { status: 404 });
      }
    }

    const comment = await prisma.issueComment.create({
      data: {
        content,
        html,
        authorId: currentUser.id,
        issueId: issue.id,
        parentId: parentId || null,
      },
      include: {
        author: { select: { id: true, name: true, image: true, useCustomAvatar: true } },
        replies: true,
      },
    });

    await notifyCommentMentions(currentUser, issue, typeof html === "string" && html.trim().length > 0 ? html : content);

    await publishEvent(`workspace:${issue.workspaceId}:events`, { type: 'issue.comments.changed', workspaceId: issue.workspaceId, issueId: issue.id }, 1000);
    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    if (error instanceof ForgeProjectWriteError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("[ISSUE_COMMENTS_POST]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
