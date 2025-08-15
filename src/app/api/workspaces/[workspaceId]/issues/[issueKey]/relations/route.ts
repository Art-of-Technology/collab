import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// GET /api/workspaces/[workspaceId]/issues/[issueKey]/relations
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; issueKey: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId, issueKey } = await params;

    // Resolve workspace by ID or slug
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        members: { some: { userId: session.user.id } }
      },
      select: { id: true, slug: true }
    });

    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace not found or access denied" },
        { status: 404 }
      );
    }

    // Find the issue
    const issue = await prisma.issue.findFirst({
      where: {
        issueKey: issueKey,
        workspaceId: workspace.id
      }
    });

    if (!issue) {
      return NextResponse.json(
        { error: "Issue not found" },
        { status: 404 }
      );
    }

    // Get all relations where this issue is the source
    const sourceRelations = await prisma.issueRelation.findMany({
      where: {
        sourceIssueId: issue.id
      },
      include: {
        targetIssue: {
          include: {
            assignee: {
              select: { id: true, name: true, image: true }
            },
            project: {
              select: { id: true, name: true, color: true }
            },
            _count: {
              select: {
                comments: true,
                children: true
              }
            }
          }
        }
      }
    });

    // Get all relations where this issue is the target
    const targetRelations = await prisma.issueRelation.findMany({
      where: {
        targetIssueId: issue.id
      },
      include: {
        sourceIssue: {
          include: {
            assignee: {
              select: { id: true, name: true, image: true }
            },
            project: {
              select: { id: true, name: true, color: true }
            },
            _count: {
              select: {
                comments: true,
                children: true
              }
            }
          }
        }
      }
    });

    // Organize relations by type
    const relations: {
      parent?: any;
      children: any[];
      blocks: any[];
      blocked_by: any[];
      relates_to: any[];
      duplicates: any[];
      duplicated_by: any[];
    } = {
      parent: undefined,
      children: [],
      blocks: [],
      blocked_by: [],
      relates_to: [],
      duplicates: [],
      duplicated_by: []
    };

    // Process source relations (this issue -> other issues)
    sourceRelations.forEach(relation => {
      const relatedIssue = {
        id: relation.targetIssue.id,
        title: relation.targetIssue.title,
        issueKey: relation.targetIssue.issueKey,
        status: relation.targetIssue.status,
        priority: relation.targetIssue.priority,
        type: relation.targetIssue.type.toLowerCase(),
        assignee: relation.targetIssue.assignee,
        project: relation.targetIssue.project,
        createdAt: relation.targetIssue.createdAt.toISOString(),
        updatedAt: relation.targetIssue.updatedAt.toISOString(),
        dueDate: relation.targetIssue.dueDate?.toISOString(),
        _count: relation.targetIssue._count
      };

      switch (relation.relationType) {
        case 'PARENT':
          relations.parent = relatedIssue;
          break;
        case 'CHILD':
          relations.children.push(relatedIssue);
          break;
        case 'BLOCKS':
          relations.blocks.push(relatedIssue);
          break;
        case 'RELATES_TO':
          relations.relates_to.push(relatedIssue);
          break;
        case 'DUPLICATES':
          relations.duplicates.push(relatedIssue);
          break;
      }
    });

    // Process target relations (other issues -> this issue)
    targetRelations.forEach(relation => {
      const relatedIssue = {
        id: relation.sourceIssue.id,
        title: relation.sourceIssue.title,
        issueKey: relation.sourceIssue.issueKey,
        status: relation.sourceIssue.status,
        priority: relation.sourceIssue.priority,
        type: relation.sourceIssue.type.toLowerCase(),
        assignee: relation.sourceIssue.assignee,
        project: relation.sourceIssue.project,
        createdAt: relation.sourceIssue.createdAt.toISOString(),
        updatedAt: relation.sourceIssue.updatedAt.toISOString(),
        dueDate: relation.sourceIssue.dueDate?.toISOString(),
        _count: relation.sourceIssue._count
      };

      switch (relation.relationType) {
        case 'PARENT':
          // If another issue has this as parent, this is child of that issue
          // But we don't show "child of" - we show the parent relationship from the parent's side
          break;
        case 'CHILD':
          // If another issue has this as child, add to our children
          relations.children.push(relatedIssue);
          break;
        case 'BLOCKS':
          relations.blocked_by.push(relatedIssue);
          break;
        case 'RELATES_TO':
          relations.relates_to.push(relatedIssue);
          break;
        case 'DUPLICATES':
          relations.duplicated_by.push(relatedIssue);
          break;
      }
    });

    return NextResponse.json({
      ...relations,
      workspace: {
        id: workspace.id,
        slug: workspace.slug
      }
    });

  } catch (error) {
    console.error("Error fetching relations:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/workspaces/[workspaceId]/issues/[issueKey]/relations
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; issueKey: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId, issueKey } = await params;
    const { targetIssueId, relationType } = await request.json();

    if (!targetIssueId || !relationType) {
      return NextResponse.json(
        { error: "targetIssueId and relationType are required" },
        { status: 400 }
      );
    }

    // Resolve workspace by ID or slug
    const workspace = await prisma.workspace.findFirst({
      where: {
        AND: [
          {
            OR: [{ id: workspaceId }, { slug: workspaceId }]
          },
          {
            OR: [
              { ownerId: session.user.id },
              { members: { some: { userId: session.user.id } } }
            ]
          }
        ]
      }
    });

    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace not found or access denied" },
        { status: 404 }
      );
    }

    // Find source issue
    const sourceIssue = await prisma.issue.findFirst({
      where: {
        issueKey: issueKey,
        workspaceId: workspace.id
      }
    });

    if (!sourceIssue) {
      return NextResponse.json(
        { error: "Source issue not found" },
        { status: 404 }
      );
    }

    // Find target issue
    const targetIssue = await prisma.issue.findFirst({
      where: {
        id: targetIssueId,
        workspaceId: workspace.id
      }
    });

    if (!targetIssue) {
      return NextResponse.json(
        { error: "Target issue not found" },
        { status: 404 }
      );
    }

    // Create the relation
    const relation = await prisma.issueRelation.create({
      data: {
        sourceIssueId: sourceIssue.id,
        targetIssueId: targetIssueId,
        relationType: relationType.toUpperCase(),
        createdBy: session.user.id
      }
    });

    return NextResponse.json({ success: true, relation });

  } catch (error) {
    console.error("Error creating relation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
