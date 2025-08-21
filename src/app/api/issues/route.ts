import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { trackCreation } from "@/lib/board-item-activity-service";
import { IssueType } from "@/types/issue";

// GET /api/issues - Get issues by workspace/project
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const projectIds = searchParams.get('projectIds')?.split(',').filter(Boolean);

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    // Verify access to workspace
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id } } },
        ],
      },
    });
    
    if (!workspace) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Build query with filters
    const whereClause: any = {
      workspaceId,
      ...(projectIds && projectIds.length > 0 && {
        projectId: { in: projectIds }
      }),
    };

    const issues = await prisma.issue.findMany({
      where: whereClause,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            slug: true,
            issuePrefix: true,
            description: true
          }
        },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        },
        reporter: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        },
        labels: {
          select: {
            id: true,
            name: true,
            color: true
          }
        },
        parent: {
          select: {
            id: true,
            title: true,
            issueKey: true,
            type: true
          }
        },
        children: {
          select: {
            id: true,
            title: true,
            issueKey: true,
            type: true,
            status: true
          }
        },
        column: {
          select: {
            id: true,
            name: true,
            color: true,
            order: true
          }
        },
        projectStatus: {
          select: {
            id: true,
            name: true,
            displayName: true,
            color: true,
            order: true,
            isDefault: true
          }
        },
        _count: {
          select: {
            children: true,
            comments: true
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    return NextResponse.json({ issues }, { status: 200 });
  } catch (error) {
    console.error('[ISSUES_GET]', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/issues - Create a new issue (unified model)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      title,
      description,
      type = 'TASK',
      status,
      priority = 'MEDIUM',
      projectId,
      workspaceId,
      assigneeId,
      reporterId,
      labels = [],
      dueDate,
      parentId,
    } = body;

    if (!title || !workspaceId || !projectId) {
      return NextResponse.json(
        { error: "Title, workspaceId and projectId are required" },
        { status: 400 }
      );
    }

    // Verify access to workspace and project
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id } } },
        ],
      },
    });
    if (!workspace) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Use a transaction to ensure atomic counter increment and issue creation
    const created = await prisma.$transaction(async (tx) => {
      // Get the latest project data with current counters
      const currentProject = await tx.project.findUnique({
        where: { id: projectId },
        select: { nextIssueNumbers: true, issuePrefix: true }
      });

      if (!currentProject) {
        throw new Error("Project not found in transaction");
      }

      // Find a unique issue key by checking existing keys and incrementing if needed
      let nextNum = (currentProject.nextIssueNumbers as any)?.[type] || 1;
      let issueKey: string;
      let attempts = 0;
      const maxAttempts = 100; // Prevent infinite loop

      do {
        issueKey = `${currentProject.issuePrefix}-${type.charAt(0)}${nextNum}`;
        
        // Check if this key already exists
        const existingIssue = await tx.issue.findFirst({
          where: {
            projectId,
            issueKey
          }
        });

        if (!existingIssue) {
          break; // Found a unique key
        }

        nextNum++;
        attempts++;
      } while (attempts < maxAttempts);

      if (attempts >= maxAttempts) {
        throw new Error("Could not generate unique issue key");
      }

      // Find the ProjectStatus for the given status and project
      let statusId = null;
      if (status) {
        const projectStatus = await tx.projectStatus.findFirst({
          where: {
            projectId,
            OR: [
              { name: status },
              { displayName: status }
            ]
          }
        });
        statusId = projectStatus?.id || null;
      }

      // If no status provided or not found, get the default status for the project
      if (!statusId) {
        const defaultStatus = await tx.projectStatus.findFirst({
          where: {
            projectId,
            isDefault: true
          }
        });
        statusId = defaultStatus?.id || null;
      }

      // Create the issue
      const newIssue = await tx.issue.create({
        data: {
          title,
          description,
          type: type,
          statusId: statusId,
          statusValue: status || undefined,
          status: status || undefined,
          priority,
          projectId,
          workspaceId,
          assigneeId: assigneeId || null,
          reporterId: reporterId || session.user.id,
          issueKey,
          dueDate: dueDate ? new Date(dueDate) : null,
          parentId: parentId || null,
          labels: labels.length
            ? { connect: labels.map((id: string) => ({ id })) }
            : undefined,
        },
        include: {
          labels: true,
          projectStatus: {
            select: {
              id: true,
              name: true,
              displayName: true,
              color: true,
              order: true,
              isDefault: true
            }
          },
        },
      });

      // Update the counter to be at least one more than what we used
      const updatedNext = { ...(currentProject.nextIssueNumbers as any) };
      updatedNext[type] = Math.max(nextNum + 1, updatedNext[type] || 1);
      await tx.project.update({
        where: { id: projectId },
        data: { nextIssueNumbers: updatedNext as any },
      });

      // Create IssueAssignee record if issue is assigned to someone
      if (assigneeId) {
        await tx.issueAssignee.create({
          data: {
            issueId: newIssue.id,
            userId: assigneeId,
            role: "ASSIGNEE",
            status: "APPROVED", // Assignees are automatically approved
            assignedAt: new Date(),
            approvedAt: new Date(),
            approvedBy: session.user.id // The creator approves the assignment
          }
        });
      }

      return newIssue;
    });

    // Track creation as activity
    await trackCreation('ISSUE', created.id, session.user.id, workspaceId, undefined, created);

    return NextResponse.json({ issue: created }, { status: 201 });
  } catch (error) {
    console.error('[ISSUES_POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

