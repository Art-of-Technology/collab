import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

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
    
    // Check if issueId is an issue key (e.g., WZB-1) or a regular ID
    const isIssueKey = /^[A-Z]+-\d+$/.test(issueId);
  
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
    const isIssueKey = /^[A-Z]+-\d+$/.test(issueId);
    
    // Find the issue first
    const existingIssue = isIssueKey 
      ? await prisma.issue.findFirst({ where: { issueKey: issueId } })
      : await prisma.issue.findUnique({ where: { id: issueId } });

    if (!existingIssue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
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

    // Update the issue
    const updatedIssue = await prisma.issue.update({
      where: { id: existingIssue.id },
      data: {
        ...body,
        updatedAt: new Date()
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
      }
    });

    return NextResponse.json({ issue: updatedIssue });

  } catch (error) {
    console.error("Error updating issue:", error);
    return NextResponse.json(
      { error: "Internal server error" },
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
    const isIssueKey = /^[A-Z]+-\d+$/.test(issueId);
    
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