"use server";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { classifyStatus } from "@/utils/teamSyncAnalyzer";

// ─── Types ───────────────────────────────────────────────────────────────────

interface QueueItem {
  id: string;
  issueKey: string;
  title: string;
  priority: "urgent" | "high" | "medium" | "low" | null;
  status: string | null;
  statusColor: string | null;
  dueDate: string | null;
  projectId: string;
  projectName: string;
  projectColor: string;
  reason: "overdue" | "due-today" | "mentioned" | "stale" | "high-priority";
  daysOverdue?: number;
  daysSinceUpdate?: number;
}

interface WorkItem {
  id: string;
  issueKey: string;
  title: string;
  status: string | null;
  statusColor: string | null;
  daysInStatus: number;
  projectName: string;
  projectColor: string;
}

interface BlockedItem {
  id: string;
  issueKey: string;
  title: string;
  status: string | null;
  statusColor: string | null;
  blockedDays: number;
  assignee: { id: string; name: string | null; image: string | null } | null;
  projectName: string;
  type: "blocked-issue" | "blocker-post";
}

interface WaitingItem {
  id: string;
  issueKey?: string;
  title: string;
  type: "mention" | "pr-review" | "assignment";
  waitingDays: number;
  from: { id: string; name: string | null; image: string | null } | null;
}

interface TeamMember {
  id: string;
  userId: string;
  name: string | null;
  image: string | null;
  inProgressCount: number;
  inReviewCount: number;
  blockedCount: number;
  completedThisWeek: number;
  currentIssue: { id: string; issueKey: string; title: string } | null;
  workloadStatus: "available" | "normal" | "heavy" | "overloaded";
}

interface RecentProject {
  id: string;
  name: string;
  slug: string;
  color: string;
  lastAccessedAt: string;
}

interface RecentView {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  projectId: string | null;
  projectSlug: string | null;
  lastAccessedAt: string;
}

interface RecentInteraction {
  id: string;
  type: "issue" | "project" | "view";
  issueKey?: string;
  title: string;
  color: string;
  projectSlug?: string;
  action: "created" | "assigned" | "status_changed" | "commented" | "viewed";
  timestamp: string;
}

interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  color: string;
  totalCount: number;
  completedCount: number;
  overdueCount: number;
  blockedCount: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function calculateDaysInStatus(updatedAt: Date, today: Date): number {
  return Math.floor((today.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Main Handler ────────────────────────────────────────────────────────────

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

    const userId = session.user.id;

    // Verify workspace access
    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId },
    });

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // ─── Date calculations ───
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // ─── Run all queries in parallel ───
    const [
      // My Queue data
      overdueIssues,
      dueTodayIssues,
      staleIssues,
      highPriorityIssues,
      // Work In Progress data (user's issues by status category)
      userIssues,
      // Blockers data
      blockedIssues,
      blockerPosts,
      // Waiting on you data
      mentionedInComments,
      // Team pulse data (all members with their issues)
      teamMembers,
      // Recently viewed data
      recentViews,
      recentProjectAccess,
      // Projects data
      projects,
      // Completed this week (for team pulse)
      completedThisWeek,
      // Recent interactions
      recentIssueInteractions,
      recentUserComments,
    ] = await Promise.all([
      // ── My Queue: Overdue issues ──
      prisma.issue.findMany({
        where: {
          workspaceId,
          dueDate: { lt: today },
          projectStatus: { isFinal: false },
          assigneeId: userId,
        },
        include: {
          project: { select: { id: true, name: true, color: true } },
          projectStatus: { select: { name: true, displayName: true, color: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 5,
      }),

      // ── My Queue: Due today ──
      prisma.issue.findMany({
        where: {
          workspaceId,
          dueDate: { gte: today, lt: tomorrow },
          projectStatus: { isFinal: false },
          assigneeId: userId,
        },
        include: {
          project: { select: { id: true, name: true, color: true } },
          projectStatus: { select: { name: true, displayName: true, color: true } },
        },
        take: 5,
      }),

      // ── My Queue: Stale issues (in progress but no update in 3+ days) ──
      prisma.issue.findMany({
        where: {
          workspaceId,
          assigneeId: userId,
          projectStatus: { isFinal: false, name: { contains: "progress", mode: "insensitive" } },
          updatedAt: { lt: threeDaysAgo },
        },
        include: {
          project: { select: { id: true, name: true, color: true } },
          projectStatus: { select: { name: true, displayName: true, color: true } },
        },
        orderBy: { updatedAt: "asc" },
        take: 3,
      }),

      // ── My Queue: High priority not started ──
      prisma.issue.findMany({
        where: {
          workspaceId,
          assigneeId: userId,
          priority: { in: ["urgent", "high"] },
          projectStatus: { isFinal: false },
          dueDate: null, // Don't duplicate overdue/due-today
        },
        include: {
          project: { select: { id: true, name: true, color: true } },
          projectStatus: { select: { name: true, displayName: true, color: true } },
        },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        take: 3,
      }),

      // ── Work In Progress: User's active issues ──
      prisma.issue.findMany({
        where: {
          workspaceId,
          assigneeId: userId,
          projectStatus: { isFinal: false },
        },
        include: {
          project: { select: { id: true, name: true, slug: true, color: true } },
          projectStatus: { select: { name: true, displayName: true, color: true } },
        },
        orderBy: { updatedAt: "desc" },
      }),

      // ── Blockers: Issues with blocking relations ──
      prisma.issue.findMany({
        where: {
          workspaceId,
          projectStatus: { isFinal: false },
          targetRelations: { some: { relationType: "BLOCKED_BY" } },
        },
        include: {
          assignee: { select: { id: true, name: true, image: true } },
          project: { select: { name: true } },
          projectStatus: { select: { name: true, displayName: true, color: true } },
          targetRelations: {
            where: { relationType: "BLOCKED_BY" },
            include: { sourceIssue: { select: { createdAt: true } } },
            take: 1,
          },
        },
        take: 5,
      }),

      // ── Blockers: Unresolved blocker posts ──
      prisma.post.findMany({
        where: {
          workspaceId,
          type: "BLOCKER",
          resolvedAt: null,
        },
        include: {
          author: { select: { id: true, name: true, image: true } },
        },
        orderBy: { createdAt: "asc" },
        take: 5,
      }),

      // ── Waiting: Comments mentioning current user that they haven't replied to ──
      prisma.issueComment.findMany({
        where: {
          issue: { workspaceId },
          content: { contains: `@${session.user.name || ""}`, mode: "insensitive" },
          authorId: { not: userId },
          createdAt: { gte: sevenDaysAgo },
        },
        include: {
          author: { select: { id: true, name: true, image: true } },
          issue: { select: { id: true, issueKey: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),

      // ── Team Pulse: All workspace members with their issues ──
      prisma.workspaceMember.findMany({
        where: { workspaceId, status: true },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
              assignedIssues: {
                where: {
                  workspaceId,
                  projectStatus: { isFinal: false },
                },
                select: {
                  id: true,
                  issueKey: true,
                  title: true,
                  updatedAt: true,
                  projectStatus: { select: { name: true } },
                },
                orderBy: { updatedAt: "desc" },
              },
            },
          },
        },
      }),

      // ── Recently Viewed: Views ──
      prisma.view.findMany({
        where: {
          workspaceId,
          lastAccessedAt: { not: null },
        },
        select: {
          id: true,
          name: true,
          slug: true,
          color: true,
          projectIds: true,
          lastAccessedAt: true,
        },
        orderBy: { lastAccessedAt: "desc" },
        take: 5,
      }),

      // ── Recently Viewed: Projects (via recent issue activity) ──
      prisma.project.findMany({
        where: {
          workspaceId,
          isArchived: false,
          issues: {
            some: {
              OR: [
                { assigneeId: userId },
                { reporterId: userId },
              ],
              updatedAt: { gte: sevenDaysAgo },
            },
          },
        },
        select: {
          id: true,
          name: true,
          slug: true,
          color: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 4,
      }),

      // ── Projects: With stats ──
      prisma.project.findMany({
        where: { workspaceId, isArchived: false },
        include: {
          _count: { select: { issues: true } },
          issues: {
            select: {
              id: true,
              dueDate: true,
              projectStatus: { select: { isFinal: true } },
              targetRelations: { where: { relationType: "BLOCKED_BY" }, select: { id: true } },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),

      // ── Completed this week (for team pulse) ──
      prisma.issue.findMany({
        where: {
          workspaceId,
          projectStatus: { isFinal: true },
          updatedAt: { gte: sevenDaysAgo },
        },
        select: {
          assigneeId: true,
        },
      }),

      // ── Recent Interactions: Issues user interacted with recently ──
      prisma.issue.findMany({
        where: {
          workspaceId,
          OR: [
            { reporterId: userId }, // Created by user
            { assigneeId: userId }, // Assigned to user
          ],
          updatedAt: { gte: sevenDaysAgo },
        },
        include: {
          project: { select: { slug: true, color: true } },
          projectStatus: { select: { name: true, displayName: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 12,
      }),

      // ── Recent Comments by user ──
      prisma.issueComment.findMany({
        where: {
          authorId: userId,
          issue: { workspaceId },
          createdAt: { gte: sevenDaysAgo },
        },
        include: {
          issue: {
            select: {
              id: true,
              issueKey: true,
              title: true,
              project: { select: { slug: true, color: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    // ─── Transform My Queue ───
    const seenIds = new Set<string>();
    const myQueue: QueueItem[] = [];

    // Add overdue first (highest priority)
    for (const issue of overdueIssues) {
      if (seenIds.has(issue.id)) continue;
      seenIds.add(issue.id);
      const daysOverdue = issue.dueDate
        ? Math.floor((today.getTime() - new Date(issue.dueDate).getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      myQueue.push({
        id: issue.id,
        issueKey: issue.issueKey || "",
        title: issue.title,
        priority: issue.priority as QueueItem["priority"],
        status: issue.projectStatus?.displayName || issue.projectStatus?.name || null,
        statusColor: issue.projectStatus?.color || null,
        dueDate: issue.dueDate?.toISOString() || null,
        projectId: issue.project?.id || "",
        projectName: issue.project?.name || "",
        projectColor: issue.project?.color || "#6366f1",
        reason: "overdue",
        daysOverdue,
      });
    }

    // Add due today
    for (const issue of dueTodayIssues) {
      if (seenIds.has(issue.id)) continue;
      seenIds.add(issue.id);
      myQueue.push({
        id: issue.id,
        issueKey: issue.issueKey || "",
        title: issue.title,
        priority: issue.priority as QueueItem["priority"],
        status: issue.projectStatus?.displayName || issue.projectStatus?.name || null,
        statusColor: issue.projectStatus?.color || null,
        dueDate: issue.dueDate?.toISOString() || null,
        projectId: issue.project?.id || "",
        projectName: issue.project?.name || "",
        projectColor: issue.project?.color || "#6366f1",
        reason: "due-today",
      });
    }

    // Add stale issues
    for (const issue of staleIssues) {
      if (seenIds.has(issue.id)) continue;
      seenIds.add(issue.id);
      const daysSinceUpdate = Math.floor(
        (today.getTime() - new Date(issue.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      myQueue.push({
        id: issue.id,
        issueKey: issue.issueKey || "",
        title: issue.title,
        priority: issue.priority as QueueItem["priority"],
        status: issue.projectStatus?.displayName || issue.projectStatus?.name || null,
        statusColor: issue.projectStatus?.color || null,
        dueDate: issue.dueDate?.toISOString() || null,
        projectId: issue.project?.id || "",
        projectName: issue.project?.name || "",
        projectColor: issue.project?.color || "#6366f1",
        reason: "stale",
        daysSinceUpdate,
      });
    }

    // Add high priority
    for (const issue of highPriorityIssues) {
      if (seenIds.has(issue.id) || myQueue.length >= 7) continue;
      seenIds.add(issue.id);
      myQueue.push({
        id: issue.id,
        issueKey: issue.issueKey || "",
        title: issue.title,
        priority: issue.priority as QueueItem["priority"],
        status: issue.projectStatus?.displayName || issue.projectStatus?.name || null,
        statusColor: issue.projectStatus?.color || null,
        dueDate: issue.dueDate?.toISOString() || null,
        projectId: issue.project?.id || "",
        projectName: issue.project?.name || "",
        projectColor: issue.project?.color || "#6366f1",
        reason: "high-priority",
      });
    }

    // ─── Transform Work In Progress ───
    const inProgress: WorkItem[] = [];
    const inReview: WorkItem[] = [];
    const readyToDeploy: WorkItem[] = [];

    for (const issue of userIssues) {
      const statusName = issue.projectStatus?.name || "";
      const statusCategory = classifyStatus(statusName);
      const daysInStatus = calculateDaysInStatus(issue.updatedAt, today);

      const workItem: WorkItem = {
        id: issue.id,
        issueKey: issue.issueKey || "",
        title: issue.title,
        status: issue.projectStatus?.displayName || statusName || null,
        statusColor: issue.projectStatus?.color || null,
        daysInStatus,
        projectName: issue.project?.name || "",
        projectColor: issue.project?.color || "#6366f1",
      };

      // Categorize based on status
      if (statusCategory === "in_progress") {
        inProgress.push(workItem);
      } else if (statusCategory === "in_review") {
        // Further categorize: deploy/staging goes to readyToDeploy
        const lowerStatus = statusName.toLowerCase();
        if (lowerStatus.includes("deploy") || lowerStatus.includes("staging") || lowerStatus.includes("release")) {
          readyToDeploy.push(workItem);
        } else {
          inReview.push(workItem);
        }
      }
    }

    // ─── Transform Blockers ───
    const blockers: BlockedItem[] = [];

    for (const issue of blockedIssues) {
      const blockRelation = issue.targetRelations[0];
      const blockedSince = blockRelation?.sourceIssue?.createdAt || issue.createdAt;
      const blockedDays = Math.floor(
        (today.getTime() - new Date(blockedSince).getTime()) / (1000 * 60 * 60 * 24)
      );
      blockers.push({
        id: issue.id,
        issueKey: issue.issueKey || "",
        title: issue.title,
        status: issue.projectStatus?.displayName || issue.projectStatus?.name || null,
        statusColor: issue.projectStatus?.color || null,
        blockedDays,
        assignee: issue.assignee,
        projectName: issue.project?.name || "",
        type: "blocked-issue",
      });
    }

    for (const post of blockerPosts) {
      const blockedDays = Math.floor(
        (today.getTime() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      blockers.push({
        id: post.id,
        issueKey: "",
        title: post.message.substring(0, 100),
        status: null,
        statusColor: null,
        blockedDays,
        assignee: post.author,
        projectName: "",
        type: "blocker-post",
      });
    }

    // Sort by blocked duration (longest first)
    blockers.sort((a, b) => b.blockedDays - a.blockedDays);

    // ─── Transform Waiting ───
    const waiting: WaitingItem[] = [];

    for (const comment of mentionedInComments) {
      const waitingDays = Math.floor(
        (today.getTime() - new Date(comment.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      waiting.push({
        id: comment.id,
        issueKey: comment.issue?.issueKey || undefined,
        title: comment.issue?.title || "Comment",
        type: "mention",
        waitingDays,
        from: comment.author,
      });
    }

    // ─── Transform Team Pulse with Planning view structure ───
    // Build completion count map
    const completionByUser = new Map<string, number>();
    for (const issue of completedThisWeek) {
      if (issue.assigneeId) {
        completionByUser.set(issue.assigneeId, (completionByUser.get(issue.assigneeId) || 0) + 1);
      }
    }

    const team: TeamMember[] = teamMembers.map((member) => {
      const issues = member.user.assignedIssues || [];

      // Categorize issues using Planning view's classifyStatus
      let inProgressCount = 0;
      let inReviewCount = 0;
      let blockedCount = 0;
      let currentIssue: TeamMember["currentIssue"] = null;

      for (const issue of issues) {
        const statusCategory = classifyStatus(issue.projectStatus?.name);

        if (statusCategory === "in_progress") {
          inProgressCount++;
          if (!currentIssue) {
            currentIssue = { id: issue.id, issueKey: issue.issueKey || "", title: issue.title };
          }
        } else if (statusCategory === "in_review") {
          inReviewCount++;
          if (!currentIssue) {
            currentIssue = { id: issue.id, issueKey: issue.issueKey || "", title: issue.title };
          }
        } else if (statusCategory === "blocked") {
          blockedCount++;
        }
      }

      const completedThisWeekCount = completionByUser.get(member.userId) || 0;
      const totalActive = inProgressCount + inReviewCount;

      // Determine workload status
      let workloadStatus: TeamMember["workloadStatus"] = "available";
      if (totalActive >= 5 || blockedCount >= 2) workloadStatus = "overloaded";
      else if (totalActive >= 3) workloadStatus = "heavy";
      else if (totalActive >= 1) workloadStatus = "normal";

      return {
        id: member.id,
        userId: member.userId,
        name: member.user.name,
        image: member.user.image,
        inProgressCount,
        inReviewCount,
        blockedCount,
        completedThisWeek: completedThisWeekCount,
        currentIssue,
        workloadStatus,
      };
    });

    // Sort: by activity (most active first)
    team.sort((a, b) => {
      const aTotal = a.inProgressCount + a.inReviewCount + a.completedThisWeek;
      const bTotal = b.inProgressCount + b.inReviewCount + b.completedThisWeek;
      return bTotal - aTotal;
    });

    // ─── Transform Recently Viewed ───
    const recentProjectsList: RecentProject[] = recentProjectAccess.map((project) => ({
      id: project.id,
      name: project.name,
      slug: project.slug,
      color: project.color || "#6366f1",
      lastAccessedAt: project.updatedAt.toISOString(),
    }));

    const recentViewsList: RecentView[] = recentViews
      .filter((view) => view.lastAccessedAt)
      .map((view) => ({
        id: view.id,
        name: view.name,
        slug: view.slug || "",
        icon: null, // Views don't have icon field
        color: view.color,
        projectId: view.projectIds?.[0] || null,
        projectSlug: null, // Would need separate lookup
        lastAccessedAt: view.lastAccessedAt!.toISOString(),
      }));

    // ─── Transform Projects ───
    const projectSummaries: ProjectSummary[] = projects.map((project) => {
      const totalCount = project._count.issues;
      const completedCount = project.issues.filter((i) => i.projectStatus?.isFinal).length;
      const overdueCount = project.issues.filter(
        (i) => i.dueDate && new Date(i.dueDate) < today && !i.projectStatus?.isFinal
      ).length;
      const blockedCount = project.issues.filter(
        (i) => i.targetRelations.length > 0 && !i.projectStatus?.isFinal
      ).length;

      return {
        id: project.id,
        name: project.name,
        slug: project.slug,
        color: project.color || "#6366f1",
        totalCount,
        completedCount,
        overdueCount,
        blockedCount,
      };
    });

    // ─── Transform Recent Interactions ───
    const interactionMap = new Map<string, RecentInteraction>();

    // Add issues user interacted with
    for (const issue of recentIssueInteractions) {
      const action = issue.reporterId === userId ? "created" : "assigned";
      interactionMap.set(`issue-${issue.id}`, {
        id: issue.id,
        type: "issue",
        issueKey: issue.issueKey || undefined,
        title: issue.title,
        color: issue.project?.color || "#6366f1",
        projectSlug: issue.project?.slug || undefined,
        action,
        timestamp: issue.updatedAt.toISOString(),
      });
    }

    // Add issues user commented on
    for (const comment of recentUserComments) {
      if (!comment.issue) continue;
      const key = `issue-${comment.issue.id}`;
      if (!interactionMap.has(key)) {
        interactionMap.set(key, {
          id: comment.issue.id,
          type: "issue",
          issueKey: comment.issue.issueKey || undefined,
          title: comment.issue.title,
          color: comment.issue.project?.color || "#6366f1",
          projectSlug: comment.issue.project?.slug || undefined,
          action: "commented",
          timestamp: comment.createdAt.toISOString(),
        });
      }
    }

    // Add recent views
    for (const view of recentViewsList) {
      interactionMap.set(`view-${view.id}`, {
        id: view.id,
        type: "view",
        title: view.name,
        color: view.color || "#8b5cf6",
        action: "viewed",
        timestamp: view.lastAccessedAt,
      });
    }

    // Add recent projects
    for (const project of recentProjectsList) {
      interactionMap.set(`project-${project.id}`, {
        id: project.id,
        type: "project",
        title: project.name,
        color: project.color,
        projectSlug: project.slug,
        action: "viewed",
        timestamp: project.lastAccessedAt,
      });
    }

    // Sort by timestamp and take top items
    const recentInteractions = Array.from(interactionMap.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 12);

    // ─── Generate Summary ───
    const urgentCount = myQueue.filter((i) => i.reason === "overdue" || i.reason === "due-today").length;
    const blockerCount = blockers.length;
    let summary = "";

    if (urgentCount > 0 && blockerCount > 0) {
      summary = `You have ${urgentCount} urgent item${urgentCount > 1 ? "s" : ""} and ${blockerCount} blocker${blockerCount > 1 ? "s" : ""} to address.`;
    } else if (urgentCount > 0) {
      summary = `You have ${urgentCount} urgent item${urgentCount > 1 ? "s" : ""} needing attention.`;
    } else if (blockerCount > 0) {
      summary = `${blockerCount} blocker${blockerCount > 1 ? "s are" : " is"} waiting to be resolved.`;
    } else if (inProgress.length > 0) {
      summary = `You have ${inProgress.length} item${inProgress.length > 1 ? "s" : ""} in progress. Keep up the momentum!`;
    } else {
      summary = "All clear! Ready to take on new work.";
    }

    return NextResponse.json({
      greeting: getGreeting(),
      summary,
      myQueue: myQueue.slice(0, 7),
      workInProgress: {
        inProgress: inProgress.slice(0, 10),
        inReview: inReview.slice(0, 10),
        readyToDeploy: readyToDeploy.slice(0, 10),
      },
      blockers: blockers.slice(0, 6),
      waiting: waiting.slice(0, 5),
      team: team.slice(0, 12),
      recentlyViewed: {
        projects: recentProjectsList,
        views: recentViewsList,
      },
      recentInteractions,
      projects: projectSummaries,
    });
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
