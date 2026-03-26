/**
 * Unified Timeline API
 * GET /api/timeline/unified - Get workspace-wide unified activity feed
 * Combines issue activities with manual posts into a single chronological feed
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Activity actions we want to show in the timeline (skip noise like VIEWED)
const MEANINGFUL_ACTIONS = [
  "CREATED",
  "STATUS_CHANGED",
  "ASSIGNED",
  "UNASSIGNED",
  "PRIORITY_CHANGED",
  "DUE_DATE_SET",
  "DUE_DATE_CHANGED",
  "TITLE_UPDATED",
  "LABELS_CHANGED",
  "STORY_POINTS_CHANGED",
  "TYPE_CHANGED",
  "TASK_PLAY_STARTED",
  "TASK_PLAY_STOPPED",
];

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "30"), 100);
    const cursor = searchParams.get("cursor"); // ISO date string for pagination
    const includeOwnOnly = searchParams.get("mine") === "true";

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    // Verify workspace access
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId: session.user.id,
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Build activity filter
    const activityWhere: any = {
      workspaceId,
      action: { in: MEANINGFUL_ACTIONS },
    };

    if (cursor) {
      activityWhere.createdAt = { lt: new Date(cursor) };
    }

    if (includeOwnOnly) {
      activityWhere.userId = session.user.id;
    }

    // Fetch issue activities
    const activities = await prisma.issueActivity.findMany({
      where: activityWhere,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        oldStatus: {
          select: {
            id: true,
            name: true,
            displayName: true,
            color: true,
            iconName: true,
          },
        },
        newStatus: {
          select: {
            id: true,
            name: true,
            displayName: true,
            color: true,
            iconName: true,
          },
        },
      },
    });

    // Get issue details for context
    const issueIds = [...new Set(activities.map((a) => a.itemId))];
    const issues = await prisma.issue.findMany({
      where: { id: { in: issueIds } },
      include: {
        projectStatus: true,
        project: true,
      },
    });
    const issueMap = new Map(issues.map((i) => [i.id, i]));

    // Collect assignee IDs from ASSIGNED/UNASSIGNED activities to resolve names
    const assigneeIds = new Set<string>();
    activities.forEach((activity) => {
      if (activity.action === "ASSIGNED" || activity.action === "UNASSIGNED") {
        // Parse values first since they might be JSON strings
        const parsedNewValue = activity.newValue ? safeJsonParse(activity.newValue) : null;
        const parsedOldValue = activity.oldValue ? safeJsonParse(activity.oldValue) : null;
        if (parsedNewValue && typeof parsedNewValue === "string") assigneeIds.add(parsedNewValue);
        if (parsedOldValue && typeof parsedOldValue === "string") assigneeIds.add(parsedOldValue);
      }
    });

    // Fetch assignee user details
    const assigneeUsers = assigneeIds.size > 0
      ? await prisma.user.findMany({
          where: { id: { in: Array.from(assigneeIds) } },
          select: { id: true, name: true },
        })
      : [];
    const assigneeMap = new Map(assigneeUsers.map((u) => [u.id, u.name]));

    // Fetch recent posts (manual updates) - only if not filtering to activities only
    const postWhere: any = {
      workspaceId,
    };
    if (cursor) {
      postWhere.createdAt = { lt: new Date(cursor) };
    }
    if (includeOwnOnly) {
      postWhere.authorId = session.user.id;
    }

    const posts = await prisma.post.findMany({
      where: postWhere,
      take: Math.floor(limit / 3), // Fewer posts than activities
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        message: true,
        html: true,
        type: true,
        priority: true,
        createdAt: true,
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        _count: {
          select: {
            comments: true,
            reactions: true,
          },
        },
      },
    });

    // Transform activities into timeline items
    const activityItems = activities.map((activity) => {
      const issue = issueMap.get(activity.itemId);

      // For ASSIGNED/UNASSIGNED actions, resolve user IDs to names
      let oldValue = activity.oldValue ? safeJsonParse(activity.oldValue) : null;
      let newValue = activity.newValue ? safeJsonParse(activity.newValue) : null;

      if (activity.action === "ASSIGNED" || activity.action === "UNASSIGNED") {
        if (typeof oldValue === "string" && assigneeMap.has(oldValue)) {
          oldValue = assigneeMap.get(oldValue) || oldValue;
        }
        if (typeof newValue === "string" && assigneeMap.has(newValue)) {
          newValue = assigneeMap.get(newValue) || newValue;
        }
      }

      return {
        id: activity.id,
        type: "activity" as const,
        action: activity.action,
        fieldName: activity.fieldName,
        oldValue,
        newValue,
        details: activity.details ? safeJsonParse(activity.details) : null,
        user: activity.user,
        // Status change FK relations — proper displayName from DB
        oldStatus: activity.oldStatus || null,
        newStatus: activity.newStatus || null,
        issue: issue
          ? {
              id: issue.id,
              issueKey: issue.issueKey,
              title: issue.title,
              type: issue.type,
              status: issue.projectStatus ? {
                id: issue.projectStatus.id,
                name: issue.projectStatus.name,
                displayName: issue.projectStatus.displayName,
                color: issue.projectStatus.color,
              } : null,
              project: issue.project ? {
                id: issue.project.id,
                name: issue.project.name,
                slug: issue.project.slug,
                color: issue.project.color,
                issuePrefix: issue.project.issuePrefix,
              } : null,
            }
          : null,
        createdAt: activity.createdAt.toISOString(),
      };
    });

    // Transform posts into timeline items
    const postItems = posts.map((post) => ({
      id: post.id,
      type: "post" as const,
      postType: post.type,
      priority: post.priority,
      message: post.message,
      html: post.html,
      user: post.author,
      commentCount: post._count.comments,
      reactionCount: post._count.reactions,
      createdAt: post.createdAt.toISOString(),
    }));

    // Merge and sort by date
    const timeline = [...activityItems, ...postItems].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Get next cursor
    const lastItem = timeline[timeline.length - 1];
    const nextCursor = lastItem ? lastItem.createdAt : null;

    // Get some stats for the header
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [todayActivityCount, weekActivityCount] = await Promise.all([
      prisma.issueActivity.count({
        where: {
          workspaceId,
          action: { in: MEANINGFUL_ACTIONS },
          createdAt: { gte: todayStart },
        },
      }),
      prisma.issueActivity.count({
        where: {
          workspaceId,
          action: { in: MEANINGFUL_ACTIONS },
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    return NextResponse.json({
      timeline: timeline.slice(0, limit),
      nextCursor,
      hasMore: timeline.length >= limit,
      stats: {
        todayCount: todayActivityCount,
        weekCount: weekActivityCount,
      },
    });
  } catch (error) {
    console.error("Error fetching unified timeline:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
