import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth-options";
import { findIssueByIdOrKey, issueReadAccessWhere } from "@/lib/issue-finder";

// POST /api/workspaces/[workspaceId]/issues/[issueKey]/relations/bulk
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; issueKey: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId, issueKey } = await params;
    const { relations } = await request.json();

    if (!Array.isArray(relations) || relations.length === 0) {
      return NextResponse.json(
        { error: "Relations array is required" },
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
              { members: { some: { userId: session.user.id, status: true } } }
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

    // Find the source issue
    const sourceIssue = await findIssueByIdOrKey(issueKey, {
      workspaceId: workspace.id,
      userId: session.user.id
    });

    if (!sourceIssue) {
      return NextResponse.json(
        { error: "Source issue not found" },
        { status: 404 }
      );
    }

    const targetIssueIds = relations.map((relation: any) => relation?.targetIssueId);
    if (targetIssueIds.some(id => typeof id !== 'string' || !id)) {
      return NextResponse.json({ error: "Invalid target issue" }, { status: 400 });
    }
    const targetIssues = await prisma.issue.findMany({
      where: { AND: [issueReadAccessWhere(session.user.id),
        { OR: [{ id: { in: targetIssueIds } }, { issueKey: { in: targetIssueIds } }] }] },
      select: { id: true, issueKey: true },
    });
    const idMap = new Map<string, string>();
    for (const issue of targetIssues) {
      idMap.set(issue.id, issue.id);
      if (issue.issueKey) idMap.set(issue.issueKey, issue.id);
    }
    if (targetIssueIds.some(id => !idMap.has(id))) {
      return NextResponse.json({ error: "One or more target issues not found" }, { status: 404 });
    }

    // Create relations - normalize CHILD to PARENT with reversed direction
    const relationData = relations.map((relation: any) => {
      const providedType = String(relation.relationType || '').toUpperCase();
      // Resolve the target issue ID (could be either database ID or issueKey)
      const resolvedTargetId = idMap.get(relation.targetIssueId)!;
      
      if (providedType === 'CHILD') {
        return {
          sourceIssueId: resolvedTargetId,
          targetIssueId: sourceIssue.id,
          relationType: 'PARENT',
          createdBy: session.user.id
        };
      }
      return {
        sourceIssueId: sourceIssue.id,
        targetIssueId: resolvedTargetId,
        relationType: providedType,
        createdBy: session.user.id
      };
    });

    // Use upsert to handle existing relations
    const createdRelations = await prisma.$transaction(
      relationData.map((data: any) =>
        prisma.issueRelation.upsert({
          where: {
            sourceIssueId_targetIssueId_relationType: {
              sourceIssueId: data.sourceIssueId,
              targetIssueId: data.targetIssueId,
              relationType: data.relationType
            }
          },
          update: {
            updatedAt: new Date()
          },
          create: data
        })
      )
    );

    return NextResponse.json({
      success: true,
      relations: createdRelations,
      message: `Created ${createdRelations.length} relation(s)`
    });

  } catch (error) {
    console.error("Error creating bulk relations:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
