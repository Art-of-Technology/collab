import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { trackCreation } from "@/lib/board-item-activity-service";
import { publishEvent } from '@/lib/redis';
import { extractMentionUserIds } from "@/utils/mentions";
import { NotificationService, NotificationType } from "@/lib/notification-service";
import { emitIssueCreated } from "@/lib/event-bus";
import { buildIssueRelations, RelationMap } from "@/utils/issueRelations";

const RELATED_ISSUE_SELECT = {
  id: true,
  issueKey: true,
  title: true,
  type: true
} as const;

// Reuse a compact include set similar to the detail route
const LIST_INCLUDE = {
  project: { select: { id: true, name: true, slug: true, issuePrefix: true, description: true, color: true } },
  assignee: { select: { id: true, name: true, email: true, image: true } },
  reporter: { select: { id: true, name: true, email: true, image: true } },
  labels: { select: { id: true, name: true, color: true } },
  parent: { 
    select: { 
      id: true, 
      title: true, 
      issueKey: true, 
      type: true, 
      status: true,
      projectStatus: { 
        select: { 
          id: true, 
          name: true, 
          displayName: true, 
          color: true 
        } 
      }
    } 
  },
  children: { 
    select: { 
      id: true, 
      title: true, 
      issueKey: true, 
      type: true, 
      status: true,
      projectStatus: { 
        select: { 
          id: true, 
          name: true, 
          displayName: true, 
          color: true 
        } 
      }
    } 
  },
  column: { select: { id: true, name: true, color: true, order: true } },
  projectStatus: { select: { id: true, name: true, displayName: true, color: true, order: true, isDefault: true } },
  _count: { select: { children: true, comments: true } },
  sourceRelations: {
    select: {
      id: true,
      relationType: true,
      targetIssue: { select: RELATED_ISSUE_SELECT }
    }
  },
  targetRelations: {
    select: {
      id: true,
      relationType: true,
      sourceIssue: { select: RELATED_ISSUE_SELECT }
    }
  }
} as const;

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
      include: LIST_INCLUDE,
      orderBy: { updatedAt: 'desc' }
    });

    const issuesWithRelations = issues.map((issue: any) => {
      const { sourceRelations, targetRelations, ...rest } = issue;
      const issueRelations: RelationMap = buildIssueRelations({
        ...issue,
        sourceRelations,
        targetRelations,
      });

      return {
        ...rest,
        issueRelations,
      };
    });

    return NextResponse.json({ issues: issuesWithRelations }, { status: 200 });
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
    // Support both workspace ID and slug
    const workspace = await prisma.workspace.findFirst({
      where: {
        AND: [
          {
            OR: [
              { id: workspaceId },
              { slug: workspaceId }
            ]
          },
          {
            OR: [
              { ownerId: session.user.id },
              { members: { some: { userId: session.user.id } } },
            ]
          }
        ]
      },
    });
    if (!workspace) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId: workspace.id },
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

      // Use TASK counter value for all issue types, but generate keys without type letters
      let nextNum: number;
      if (typeof currentProject.nextIssueNumbers === 'object' && currentProject.nextIssueNumbers !== null) {
        const counters = currentProject.nextIssueNumbers as any;
        nextNum = counters.TASK || 1;
      } else {
        nextNum = 1;
      }

      let issueKey: string;
      let attempts = 0;
      const maxAttempts = 100; // Prevent infinite loop

      do {
        issueKey = `${currentProject.issuePrefix}-${nextNum}`;
        
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
          workspaceId: workspace.id,
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
          workspace: {
            select: {
              id: true,
              name: true,
              slug: true
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
        },
      });

      // Update the TASK counter to be one more than what we used (all types use TASK counter now)
      const updatedNext = { ...(currentProject.nextIssueNumbers as any) };
      updatedNext.TASK = nextNum + 1;
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

      // If this is a sub-issue (has a parent), create the PARENT relation
      if (parentId) {
        await tx.issueRelation.create({
          data: {
            sourceIssueId: newIssue.id,
            targetIssueId: parentId,
            relationType: 'PARENT',
          },
        });
      }

      return newIssue;
    });

    // Track creation as activity
    await trackCreation('ISSUE', created.id, session.user.id, workspace.id, undefined, created);

    // Publish realtime creation event
    await publishEvent(`workspace:${workspace.id}:events`, {
      type: 'issue.created',
      workspaceId: workspace.id,
      projectId: created.projectId,
      issueId: created.id,
      issueKey: created.issueKey,
      status: created.status ?? undefined,
      statusId: created.statusId ?? undefined,
      statusValue: created.statusValue ?? undefined,
    });

    // Minimal notifications for followers, assignee and reporter, and board/project followers
    try {
      const recipientIds = new Set<string>();

      // Issue followers
      const followers = await prisma.issueFollower.findMany({
        where: { issueId: created.id },
        select: { userId: true }
      });
      followers.forEach(f => recipientIds.add(f.userId));

      // Assignee and reporter
      if (created.assigneeId && created.assigneeId !== session.user.id) recipientIds.add(created.assigneeId);
      if (created.reporterId && created.reporterId !== session.user.id) recipientIds.add(created.reporterId);

      // Project followers
      const projectFollowerList = await prisma.projectFollower.findMany({
        where: { projectId: created.projectId },
        select: { userId: true }
      });
      projectFollowerList.forEach((pf: { userId: string }) => recipientIds.add(pf.userId));

      const recipients = Array.from(recipientIds).filter(id => id !== session.user.id);
      if (recipients.length > 0) {
        const pfSet = new Set(projectFollowerList.map(pf => pf.userId));
        const projectType = NotificationType.PROJECT_ISSUE_CREATED;
        const issueType = NotificationType.ISSUE_CREATED;
        const content = `@[${session.user.name}](${session.user.id}) created an issue #[${created.issueKey}](${created.id})`;

        // Send project-level notifications to project followers
        const projectFollowerRecipients = recipients.filter((id) => pfSet.has(id));
        if (projectFollowerRecipients.length > 0) {
          await NotificationService.notifyUsers(
            projectFollowerRecipients,
            projectType,
            content,
            session.user.id,
            { issueId: created.id }
          );
        }

        // Send standard issue notifications to the rest
        const standardRecipients = recipients.filter((id) => !pfSet.has(id));
        if (standardRecipients.length > 0) {
          await NotificationService.notifyUsers(
            standardRecipients,
            issueType,
            content,
            session.user.id,
            { issueId: created.id }
          );
        }
      }
    } catch (notificationError) {
      console.warn('[ISSUES_POST_NOTIFY]', notificationError);
    }

    // Mentions in description (notify tagged users)
    try {
      if (description && typeof description === 'string') {
        const mentionedUserIds = extractMentionUserIds(description);
        const recipients = mentionedUserIds.filter((id) => id !== session.user.id);
        if (recipients.length > 0) {
          await NotificationService.notifyUsers(
            recipients,
            NotificationType.ISSUE_MENTION,
            `@[${session.user.name}](${session.user.id}) mentioned you in an issue #[${created.issueKey}](${created.id})`,
            session.user.id,
            { issueId: created.id }
          );
        }
      }
    } catch (e) {
      console.warn('[ISSUES_POST_MENTIONS]', e);
    }

    // Emit webhook event for issue creation
    try {
      await emitIssueCreated(
        created,
        {
          userId: session.user.id,
          workspaceId: created.workspaceId,
          workspaceName: created.workspace?.name || '',
          workspaceSlug: created.workspace?.slug || '',
          source: 'api'
        },
        { async: true } // Don't block the response
      );
    } catch (e) {
      console.warn('[ISSUES_POST_WEBHOOK]', e);
    }

    return NextResponse.json({ issue: created }, { status: 201 });
  } catch (error) {
    console.error('[ISSUES_POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
