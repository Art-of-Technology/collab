import { publishEvent } from '@/lib/redis';
import { assertLegacyIssueWriteAllowed, ForgeProjectWriteError } from '@/lib/forge/legacy-write-guard';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { findIssueByIdOrKey } from "@/lib/issue-finder";
import { notifyCommentMentions } from "@/lib/issue-comment-mentions";
import { ACK_TYPE, commentAcks, type AckComment, type CommentAck } from "@/lib/issue-comment-acks";

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

    // Every comment the answer carries, replies included, once. A failed read of the acks leaves `ack` null.
    const flat = new Map<string, AckComment>();
    for (const comment of comments) for (const row of [comment, ...(comment.replies ?? [])]) {
      flat.set(row.id, { ...row, authorId: row.author?.id ?? row.authorId });
    }
    let acks = new Map<string, CommentAck>();
    try { acks = await commentAcks(issue.id, [...flat.values()]); } catch { /* the list is answered without acks */ }
    // The ack is in `ack`, so it is not listed among the reactions: those stay what people added.
    const withAck = <T extends { id: string; reactions: { type: string }[] }>(row: T) =>
      ({ ...row, reactions: row.reactions.filter(reaction => reaction.type !== ACK_TYPE), ack: acks.get(row.id) ?? null });

    return NextResponse.json(comments.map(comment => ({ ...withAck(comment), replies: comment.replies?.map(withAck) })));
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
