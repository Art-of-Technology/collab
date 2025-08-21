import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { trackFieldChanges, createActivity, compareObjects } from "@/lib/board-item-activity-service";

export const dynamic = 'force-dynamic';

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

    // Normalize type if provided: accept "Bug" from clients but store as DEFECT enum
    if (typeof updateData.type === 'string') {
      const upper = updateData.type.toUpperCase();
      updateData.type = upper === 'DEFECT' ? 'BUG' : upper;
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

    // Delete the issue
    await prisma.issue.delete({
      where: { id: existingIssue.id }
    });

    return NextResponse.json({ message: "Issue deleted successfully" });

  } catch (error) {
    console.error("Error deleting issue:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}