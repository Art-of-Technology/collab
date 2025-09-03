import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { trackFieldChanges, createActivity, compareObjects } from "@/lib/board-item-activity-service";
import { publishEvent } from '@/lib/redis';
import { extractMentionUserIds } from "@/utils/mentions";
import { sanitizeHtmlToPlainText } from "@/lib/html-sanitizer";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/issues/[issueId] - Get issue details
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const { issueId } = resolvedParams;
    
    // Check if issueId is an issue key (e.g., WZB-1, MA-T140, DNN1-T2) or a regular ID
    const isIssueKey = /^[A-Z]+[0-9]*-[A-Z]*\d+$/.test(issueId);
    
    console.log(`API: Resolving issueId: ${issueId}, isIssueKey: ${isIssueKey}`);
  
    // Fetch the issue either by ID or issue key
    const issue = isIssueKey 
      ? await prisma.issue.findFirst({
          where: { issueKey: issueId },
          include: {
            assignee: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
                useCustomAvatar: true
              }
            },
            reporter: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
                useCustomAvatar: true
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
            project: {
              select: {
                id: true,
                name: true,
                slug: true,
                issuePrefix: true,
                description: true
              }
            },
            workspace: {
              select: {
                id: true,
                name: true,
                slug: true
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
            comments: {
              include: {
                author: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    image: true,
                    useCustomAvatar: true
                  }
                }
              },
              orderBy: {
                createdAt: 'asc'
              }
            },
            _count: {
              select: {
                children: true,
                comments: true
              }
            }
          }
        })
      : await prisma.issue.findUnique({
          where: { id: issueId },
          include: {
            assignee: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
                useCustomAvatar: true
              }
            },
            reporter: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
                useCustomAvatar: true
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
            project: {
              select: {
                id: true,
                name: true,
                slug: true,
                issuePrefix: true,
                description: true
              }
            },
            workspace: {
              select: {
                id: true,
                name: true,
                slug: true
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
            comments: {
              include: {
                author: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    image: true,
                    useCustomAvatar: true
                  }
                }
              },
              orderBy: {
                createdAt: 'asc'
              }
            },
            _count: {
              select: {
                children: true,
                comments: true
              }
            }
          }
        });

    if (!issue) {
      return NextResponse.json(
        { error: "Issue not found" },
        { status: 404 }
      );
    }

    // Check if user has access to the workspace
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: issue.workspaceId,
        OR: [
          { ownerId: currentUser.id },
          { members: { some: { userId: currentUser.id } } }
        ]
      }
    });

    if (!hasAccess) {
      return NextResponse.json(
        { error: "You don't have permission to view this issue" },
        { status: 403 }
      );
    }

    return NextResponse.json({ issue });

  } catch (error) {
    console.error("Error fetching issue:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT /api/issues/[issueId] - Update issue
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const { issueId } = resolvedParams;
    const body = await req.json();

    // Check if issueId is an issue key or ID
    // Pattern matches formats like: ABC-123, ABC-T123, CHAT-T1, DNN1-T2, etc.
    const isIssueKey = /^[A-Z]+[0-9]*-[A-Z]*\d+$/.test(issueId);
    
    // Find the issue first
    const existingIssue = isIssueKey 
      ? await prisma.issue.findFirst({ where: { issueKey: issueId } })
      : await prisma.issue.findUnique({ where: { id: issueId } });

    if (!existingIssue) {
      return NextResponse.json({ 
        error: "Issue not found", 
        message: `Issue ${issueId} not found` 
      }, { status: 404 });
    }

    // Check workspace access
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: existingIssue.workspaceId,
        OR: [
          { ownerId: currentUser.id },
          { members: { some: { userId: currentUser.id } } }
        ]
      }
    });

    if (!hasAccess) {
      return NextResponse.json(
        { error: "You don't have permission to update this issue" },
        { status: 403 }
      );
    }

    // Handle status updates to work with new ProjectStatus system
    let updateData = { ...body, updatedAt: new Date() };

    // Normalize type casing if provided
    if (typeof updateData.type === 'string') {
      updateData.type = updateData.type.toUpperCase();
    }
    
    // Handle labels relation updates
    let relationalUpdates: any = {};
    if (Array.isArray(body.labels)) {
      // Handle both arrays of IDs and arrays of label objects
      const labelIds = body.labels.map((label: any) => 
        typeof label === 'string' ? label : label.id
      ).filter(Boolean);
      
      relationalUpdates.labels = {
        set: labelIds.map((id: string) => ({ id }))
      };
      delete (updateData as any).labels;
    }
    
    // If status or statusValue is being updated, find the corresponding ProjectStatus
    if (body.status || body.statusValue) {
      const statusValue = body.status || body.statusValue;
      
      // Find the ProjectStatus record for this status in this project
      const projectStatus = await prisma.projectStatus.findFirst({
        where: {
          projectId: existingIssue.projectId,
          name: statusValue,
          isActive: true
        }
      });
      
      if (projectStatus) {
        // Update both statusId and statusValue for the new system
        updateData.statusId = projectStatus.id;
        updateData.statusValue = statusValue;
        updateData.status = statusValue; // Keep legacy field for compatibility
      } else {
        // No ProjectStatus found, just update the legacy status field
        updateData.status = statusValue;
        updateData.statusValue = statusValue;
      }
    }

    // Capture old issue for activity comparison
    const oldIssue = existingIssue;

    // Handle assignee changes - create/update IssueAssignee record
    const assigneeChanged = body.assigneeId !== undefined && body.assigneeId !== oldIssue.assigneeId;
    
    // Update the issue and handle assignee changes in a transaction
    const updatedIssue = await prisma.$transaction(async (tx) => {
      // Update the issue
      const issue = await tx.issue.update({
        where: { id: existingIssue.id },
        data: {
          ...updateData,
          ...(Object.keys(relationalUpdates).length > 0 ? relationalUpdates : {}),
        },
        include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            useCustomAvatar: true
          }
        },
        reporter: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            useCustomAvatar: true
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
        project: {
          select: {
            id: true,
            name: true,
            slug: true,
            issuePrefix: true,
            description: true
          }
        },
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
            iconName: true,
            order: true
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
        }
      }});

      // Handle assignee changes - create/update IssueAssignee records
      if (assigneeChanged) {
        // Create new assignee record if assigned to someone
        if (issue.assigneeId) {
          await tx.issueAssignee.upsert({
            where: {
              issueId_userId: {
                issueId: existingIssue.id,
                userId: issue.assigneeId
              }
            },
            create: {
              issueId: existingIssue.id,
              userId: issue.assigneeId,
              role: "ASSIGNEE",
              status: "APPROVED", // Assignees are automatically approved
              assignedAt: new Date(),
              approvedAt: new Date(),
              approvedBy: currentUser.id
            },
            update: {
              role: "ASSIGNEE", // If they were a helper, promote them to assignee
              status: "APPROVED",
              approvedAt: new Date(),
              approvedBy: currentUser.id
            }
          });
        }
      }

      return issue;
    });

    // Track activities for changed fields (Issue-centric)
    try {
      const fieldsToTrack = [
        'title',
        'description',
        'assigneeId',
        'reporterId',
        'status',
        'priority',
        'columnId',
        'dueDate',
        'storyPoints',
        'type',
        'color',
        'parentId'
      ];
      
      // Use the existing compareObjects function to detect changes
      const changes = compareObjects(oldIssue, updatedIssue, fieldsToTrack);

      if (changes.length > 0) {
        await trackFieldChanges(
          'ISSUE',
          updatedIssue.id,
          currentUser.id,
          updatedIssue.workspaceId,
          changes
        );
      }
    } catch (e) {
      console.warn('Issue activity tracking failed:', e);
    }

    await publishEvent(`workspace:${updatedIssue.workspaceId}:events`, {
      type: 'issue.updated',
      workspaceId: updatedIssue.workspaceId,
      projectId: updatedIssue.projectId,
      issueId: updatedIssue.id,
      issueKey: updatedIssue.issueKey,
      status: updatedIssue.status ?? undefined,
      statusId: updatedIssue.statusId ?? undefined,
      statusValue: updatedIssue.statusValue ?? undefined,
      columnId: updatedIssue.columnId ?? undefined,
      updatedAt: updatedIssue.updatedAt
    });

    // Mentions in updated description (notify tagged users)
    try {
      if (typeof (updateData as any).description === 'string' && (updateData as any).description.trim().length > 0) {
        const mentionedUserIds = extractMentionUserIds((updateData as any).description);
        const recipients = mentionedUserIds.filter((id: string) => id !== currentUser.id);
        if (recipients.length > 0) {
          await prisma.notification.createMany({
            data: recipients.map((userId: string) => ({
              type: 'ISSUE_MENTION',
              content: `@[${currentUser.name}](${currentUser.id}) mentioned you in an issue #[${updatedIssue.issueKey}](${updatedIssue.id})`,
              userId,
              senderId: currentUser.id,
            }))
          });
        }
      }
    } catch (e) {
      console.warn('[ISSUES_PUT_MENTIONS]', e);
    }

    try {
      const recipientIds = new Set<string>();

      // Issue followers
      const followers = await prisma.issueFollower.findMany({
        where: { issueId: updatedIssue.id },
        select: { userId: true }
      });
      followers.forEach(f => recipientIds.add(f.userId));

      // Assignee and reporter
      if (updatedIssue.assigneeId) recipientIds.add(updatedIssue.assigneeId);
      if (updatedIssue.reporterId) recipientIds.add(updatedIssue.reporterId);

      // Board followers via legacy column->board mapping, if any
      if (updatedIssue.columnId) {
        const column = await prisma.taskColumn.findUnique({
          where: { id: updatedIssue.columnId },
          select: { taskBoardId: true }
        });
        if (column?.taskBoardId) {
          const boardFollowers = await prisma.boardFollower.findMany({
            where: { boardId: column.taskBoardId },
            select: { userId: true }
          });
          boardFollowers.forEach(bf => recipientIds.add(bf.userId));
        }
      }

      // Project followers
      const projectFollowers = await (prisma as any).projectFollower.findMany({
        where: { projectId: updatedIssue.projectId },
        select: { userId: true }
      });
      projectFollowers.forEach((pf: { userId: string }) => recipientIds.add(pf.userId));

      const actorId = currentUser.id;
      const recipients = Array.from(recipientIds).filter(id => id !== actorId);
      if (recipients.length > 0) {
        // Gather project followers for type selection
        const projectFollowers = await prisma.projectFollower.findMany({
          where: { projectId: updatedIssue.projectId },
          select: { userId: true }
        });
        const pfSet = new Set(projectFollowers.map(pf => pf.userId));
        await prisma.notification.createMany({
          data: recipients.map(userId => ({
            type: pfSet.has(userId) ? 'PROJECT_ISSUE_UPDATED' : 'ISSUE_UPDATED',
            content: `@[${currentUser.name}](${currentUser.id}) updated an issue #[${updatedIssue.issueKey}](${updatedIssue.id})`,
            userId,
            senderId: actorId
          }))
        });
      }
    } catch (notificationError) {
      console.warn('[ISSUES_PUT_NOTIFY]', notificationError);
    }

    return NextResponse.json({ issue: updatedIssue });

  } catch (error) {
    console.error("Error updating issue:", error);
    return NextResponse.json(
      { 
        error: "Internal server error",
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}

// DELETE /api/issues/[issueId] - Delete issue
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const { issueId } = resolvedParams;

    // Check if issueId is an issue key or ID
    const isIssueKey = /^[A-Z]+[0-9]*-[A-Z]*\d+$/.test(issueId);
    
    // Find the issue first
    const existingIssue = isIssueKey 
      ? await prisma.issue.findFirst({ where: { issueKey: issueId } })
      : await prisma.issue.findUnique({ where: { id: issueId } });

    if (!existingIssue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    // Check workspace access and ownership
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: existingIssue.workspaceId,
        OR: [
          { ownerId: currentUser.id },
          { members: { some: { userId: currentUser.id } } }
        ]
      }
    });

    if (!hasAccess) {
      return NextResponse.json(
        { error: "You don't have permission to delete this issue" },
        { status: 403 }
      );
    }

    // Prepare notifications before deletion
    let deletionRecipients: string[] = [];
    try {
      const recipientIds = new Set<string>();
      // Issue followers
      const followers = await prisma.issueFollower.findMany({
        where: { issueId: existingIssue.id },
        select: { userId: true }
      });
      followers.forEach(f => recipientIds.add(f.userId));
      // Assignee and reporter
      if ((existingIssue as any).assigneeId) recipientIds.add((existingIssue as any).assigneeId as string);
      if ((existingIssue as any).reporterId) recipientIds.add((existingIssue as any).reporterId as string);
      // Board followers via legacy column->board mapping, if any
      if ((existingIssue as any).columnId) {
        const column = await prisma.taskColumn.findUnique({
          where: { id: (existingIssue as any).columnId as string },
          select: { taskBoardId: true }
        });
        if (column?.taskBoardId) {
          const boardFollowers = await prisma.boardFollower.findMany({
            where: { boardId: column.taskBoardId },
            select: { userId: true }
          });
          boardFollowers.forEach(bf => recipientIds.add(bf.userId));
        }
      }
      // Project followers
      const projectFollowers = await (prisma as any).projectFollower.findMany({
        where: { projectId: (existingIssue as any).projectId as string },
        select: { userId: true }
      });
      projectFollowers.forEach((pf: { userId: string }) => recipientIds.add(pf.userId));
      deletionRecipients = Array.from(recipientIds).filter(id => id !== currentUser.id);
    } catch (prepErr) {
      console.warn('[ISSUES_DELETE_NOTIFY_PREP]', prepErr);
    }

    // Delete the issue
    await prisma.issue.delete({
      where: { id: existingIssue.id }
    });

    // Send deletion notifications
    try {
      if (deletionRecipients.length > 0) {
        // Build project follower set
        const projectFollowers = await prisma.projectFollower.findMany({
          where: { projectId: (existingIssue as any).projectId as string },
          select: { userId: true }
        });
        const pfSet = new Set(projectFollowers.map(pf => pf.userId));
        await prisma.notification.createMany({
          data: deletionRecipients.map(userId => ({
            type: pfSet.has(userId) ? 'PROJECT_ISSUE_DELETED' : 'ISSUE_DELETED',
            content: `@[${currentUser.name}](${currentUser.id}) deleted an issue #[${(existingIssue as any).issueKey}](${existingIssue.id})`,
            userId,
            senderId: currentUser.id
          }))
        });
      }
    } catch (notificationError) {
      console.warn('[ISSUES_DELETE_NOTIFY]', notificationError);
    }

    return NextResponse.json({ message: "Issue deleted successfully" });

  } catch (error) {
    console.error("Error deleting issue:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}