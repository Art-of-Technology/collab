"use server";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateInsights, AIInsight } from "@/components/dashboard/AIInsightsPanel";

interface FocusItem {
  id: string;
  issueKey: string;
  title: string;
  priority: 'urgent' | 'high' | 'medium' | 'low' | null;
  status: string | null;
  statusColor?: string | null;
  dueDate?: string | null;
  assignee?: {
    name: string | null;
    image: string | null;
  } | null;
  project?: {
    name: string;
    color: string | null;
  } | null;
  reason: 'overdue' | 'due-today' | 'at-risk' | 'high-priority' | 'blocked';
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace ID required" }, { status: 400 });
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

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    const oneWeekAgo = new Date(today);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // Get focus items - issues that need attention
    const [
      overdueIssues,
      dueTodayIssues,
      atRiskIssues,
      highPriorityIssues,
      blockedIssues,
      completedThisWeek,
      unassignedIssues,
    ] = await Promise.all([
      // Overdue issues assigned to current user
      prisma.issue.findMany({
        where: {
          project: { workspaceId },
          dueDate: { lt: today },
          status: { category: { not: "completed" } },
          OR: [
            { assigneeId: session.user.id },
            { creatorId: session.user.id },
          ],
        },
        include: {
          assignee: { select: { name: true, image: true } },
          project: { select: { name: true, color: true } },
          status: { select: { name: true, color: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 5,
      }),
      // Due today
      prisma.issue.findMany({
        where: {
          project: { workspaceId },
          dueDate: { gte: today, lt: tomorrow },
          status: { category: { not: "completed" } },
          OR: [
            { assigneeId: session.user.id },
            { creatorId: session.user.id },
          ],
        },
        include: {
          assignee: { select: { name: true, image: true } },
          project: { select: { name: true, color: true } },
          status: { select: { name: true, color: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 5,
      }),
      // At risk (due in next 3 days)
      prisma.issue.findMany({
        where: {
          project: { workspaceId },
          dueDate: { gte: tomorrow, lte: threeDaysFromNow },
          status: { category: { not: "completed" } },
          OR: [
            { assigneeId: session.user.id },
            { creatorId: session.user.id },
          ],
        },
        include: {
          assignee: { select: { name: true, image: true } },
          project: { select: { name: true, color: true } },
          status: { select: { name: true, color: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 5,
      }),
      // High priority unresolved
      prisma.issue.findMany({
        where: {
          project: { workspaceId },
          priority: { in: ["urgent", "high"] },
          status: { category: { not: "completed" } },
          OR: [
            { assigneeId: session.user.id },
            { creatorId: session.user.id },
          ],
        },
        include: {
          assignee: { select: { name: true, image: true } },
          project: { select: { name: true, color: true } },
          status: { select: { name: true, color: true } },
        },
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
        take: 5,
      }),
      // Blocked issues in workspace
      prisma.issue.findMany({
        where: {
          project: { workspaceId },
          labels: { some: { name: { contains: "blocked", mode: "insensitive" } } },
          status: { category: { not: "completed" } },
        },
        include: {
          assignee: { select: { name: true, image: true } },
          project: { select: { name: true, color: true } },
          status: { select: { name: true, color: true } },
        },
        take: 5,
      }),
      // Completed this week
      prisma.issue.count({
        where: {
          project: { workspaceId },
          status: { category: "completed" },
          updatedAt: { gte: oneWeekAgo },
        },
      }),
      // Unassigned issues
      prisma.issue.count({
        where: {
          project: { workspaceId },
          assigneeId: null,
          status: { category: { not: "completed" } },
        },
      }),
    ]);

    // Transform to FocusItems
    const transformIssue = (issue: any, reason: FocusItem['reason']): FocusItem => ({
      id: issue.id,
      issueKey: issue.issueKey,
      title: issue.title,
      priority: issue.priority as FocusItem['priority'],
      status: issue.status?.name || null,
      statusColor: issue.status?.color || null,
      dueDate: issue.dueDate?.toISOString() || null,
      assignee: issue.assignee,
      project: issue.project,
      reason,
    });

    // Combine and dedupe focus items
    const focusItemsMap = new Map<string, FocusItem>();

    overdueIssues.forEach(issue => {
      if (!focusItemsMap.has(issue.id)) {
        focusItemsMap.set(issue.id, transformIssue(issue, 'overdue'));
      }
    });

    blockedIssues.forEach(issue => {
      if (!focusItemsMap.has(issue.id)) {
        focusItemsMap.set(issue.id, transformIssue(issue, 'blocked'));
      }
    });

    dueTodayIssues.forEach(issue => {
      if (!focusItemsMap.has(issue.id)) {
        focusItemsMap.set(issue.id, transformIssue(issue, 'due-today'));
      }
    });

    atRiskIssues.forEach(issue => {
      if (!focusItemsMap.has(issue.id)) {
        focusItemsMap.set(issue.id, transformIssue(issue, 'at-risk'));
      }
    });

    highPriorityIssues.forEach(issue => {
      if (!focusItemsMap.has(issue.id)) {
        focusItemsMap.set(issue.id, transformIssue(issue, 'high-priority'));
      }
    });

    const focusItems = Array.from(focusItemsMap.values());

    // Generate AI insights
    const insights = generateInsights({
      overdueCount: overdueIssues.length,
      atRiskCount: atRiskIssues.length,
      blockedCount: blockedIssues.length,
      completedThisWeek,
      unassignedCount: unassignedIssues,
    });

    // Get quick stats
    const [totalActive, totalProjects, recentActivity] = await Promise.all([
      prisma.issue.count({
        where: {
          project: { workspaceId },
          status: { category: { not: "completed" } },
        },
      }),
      prisma.project.count({
        where: { workspaceId },
      }),
      prisma.activity.count({
        where: {
          issue: { project: { workspaceId } },
          createdAt: { gte: oneWeekAgo },
        },
      }),
    ]);

    return NextResponse.json({
      focusItems,
      insights,
      stats: {
        totalActive,
        totalProjects,
        completedThisWeek,
        recentActivity,
        overdueCount: overdueIssues.length,
        unassignedCount: unassignedIssues,
      },
    });
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
