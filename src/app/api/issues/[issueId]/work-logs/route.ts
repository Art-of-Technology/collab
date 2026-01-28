import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { findIssueByIdOrKey } from "@/lib/issue-finder";
import { z } from "zod";

const CreateWorkLogSchema = z.object({
  timeSpent: z.number().int().positive(),
  description: z.string().optional(),
  loggedAt: z.string().datetime().optional(),
});

// GET /api/issues/[issueId]/work-logs - Get work logs for an issue
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
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");
    const userId = searchParams.get("userId");

    // Resolve issue by key or id with workspace scoping
    const issue = await findIssueByIdOrKey(issueId, {
      userId: currentUser.id,
      select: { id: true, workspaceId: true, issueKey: true, timeEstimateMinutes: true, timeSpentMinutes: true },
    });

    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    const whereClause = {
      issueId: issue.id,
      ...(userId && { userId }),
    };

    const [workLogs, total] = await Promise.all([
      prisma.workLog.findMany({
        where: whereClause,
        orderBy: { loggedAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      }),
      prisma.workLog.count({ where: whereClause }),
    ]);

    // Calculate time tracking summary
    const totalTimeSpent = await prisma.workLog.aggregate({
      where: { issueId: issue.id },
      _sum: { timeSpent: true },
    });

    const timeRemaining = issue.timeEstimateMinutes
      ? Math.max(0, issue.timeEstimateMinutes - (totalTimeSpent._sum.timeSpent || 0))
      : null;

    return NextResponse.json({
      issueKey: issue.issueKey,
      issueId: issue.id,
      workLogs: workLogs.map((log) => ({
        id: log.id,
        timeSpent: log.timeSpent,
        description: log.description,
        loggedAt: log.loggedAt,
        createdAt: log.createdAt,
        updatedAt: log.updatedAt,
        user: log.user,
      })),
      summary: {
        totalTimeSpent: totalTimeSpent._sum.timeSpent || 0,
        timeEstimate: issue.timeEstimateMinutes,
        timeRemaining,
        logCount: total,
      },
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + workLogs.length < total,
      },
    });
  } catch (error) {
    console.error("[WORK_LOGS_GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/issues/[issueId]/work-logs - Create a work log entry
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
    const body = await request.json();

    // Validate input
    const parseResult = CreateWorkLogSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parseResult.error.errors },
        { status: 400 }
      );
    }
    const data = parseResult.data;

    // Resolve issue by key or id with workspace scoping
    const issue = await findIssueByIdOrKey(issueId, {
      userId: currentUser.id,
    });

    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    // Create work log and update issue time spent in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the work log
      const workLog = await tx.workLog.create({
        data: {
          issueId: issue.id,
          userId: currentUser.id,
          workspaceId: issue.workspaceId,
          timeSpent: data.timeSpent,
          description: data.description || null,
          loggedAt: data.loggedAt ? new Date(data.loggedAt) : new Date(),
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      });

      // Update issue's total time spent
      const updatedIssue = await tx.issue.update({
        where: { id: issue.id },
        data: {
          timeSpentMinutes: {
            increment: data.timeSpent,
          },
        },
        select: {
          id: true,
          issueKey: true,
          timeEstimateMinutes: true,
          timeSpentMinutes: true,
        },
      });

      // Log activity
      await tx.issueActivity.create({
        data: {
          action: "TIME_LOGGED",
          itemType: "ISSUE",
          itemId: issue.id,
          userId: currentUser.id,
          workspaceId: issue.workspaceId,
          projectId: issue.projectId,
          fieldName: "timeSpent",
          oldValue: JSON.stringify(issue.timeSpentMinutes),
          newValue: JSON.stringify(updatedIssue.timeSpentMinutes),
          details: JSON.stringify({
            workLogId: workLog.id,
            timeLogged: data.timeSpent,
            description: data.description,
          }),
        },
      });

      return { workLog, issue: updatedIssue };
    });

    const timeRemaining = result.issue.timeEstimateMinutes
      ? Math.max(0, result.issue.timeEstimateMinutes - result.issue.timeSpentMinutes)
      : null;

    return NextResponse.json(
      {
        workLog: {
          id: result.workLog.id,
          timeSpent: result.workLog.timeSpent,
          description: result.workLog.description,
          loggedAt: result.workLog.loggedAt,
          createdAt: result.workLog.createdAt,
          user: result.workLog.user,
        },
        issue: {
          issueKey: result.issue.issueKey,
          timeEstimateMinutes: result.issue.timeEstimateMinutes,
          timeSpentMinutes: result.issue.timeSpentMinutes,
          timeRemaining,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[WORK_LOGS_POST]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
