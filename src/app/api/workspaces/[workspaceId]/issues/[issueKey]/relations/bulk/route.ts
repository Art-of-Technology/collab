import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { findIssueByIdOrKey } from "@/lib/issue-finder";

// POST /api/workspaces/[workspaceId]/issues/[issueKey]/relations/bulk
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

    // Validate all target issues exist and user has access to their workspaces
    // Handle both database IDs and issue keys
    const targetIssueIds = relations.map((r: any) => r.targetIssueId);
    
    // Try to find issues by ID first (most common case)
    let targetIssues = await prisma.issue.findMany({
      where: {
        id: { in: targetIssueIds }
      },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            ownerId: true,
            members: {
              where: { userId: session.user.id },
              select: { id: true }
            }
          }
        }
      }
    });

    // If some issues weren't found by ID, they might be issue keys
    const foundIds = new Set(targetIssues.map(issue => issue.id));
    const notFoundIds = targetIssueIds.filter(id => !foundIds.has(id));
    
    if (notFoundIds.length > 0) {
      // Try to find remaining issues by issueKey
      const issuesByKey = await Promise.all(
        notFoundIds.map(idOrKey => 
          findIssueByIdOrKey(idOrKey, {
            userId: session.user.id,
            include: {
              workspace: {
                select: {
                  id: true,
                  name: true,
                  ownerId: true,
                  members: {
                    where: { userId: session.user.id },
                    select: { id: true }
                  }
                }
              }
            }
          })
        )
      );
      
      // Filter out null results and add to targetIssues
      const foundByKey = issuesByKey.filter(Boolean) as typeof targetIssues;
      targetIssues = [...targetIssues, ...foundByKey];
    }

    if (targetIssues.length !== targetIssueIds.length) {
      return NextResponse.json(
        { error: "One or more target issues not found" },
        { status: 404 }
      );
    }

    // Verify user has access to all target issue workspaces
    const inaccessibleIssues = targetIssues.filter(issue => 
      issue.workspace.ownerId !== session.user.id && 
      issue.workspace.members.length === 0
    );

    if (inaccessibleIssues.length > 0) {
      return NextResponse.json(
        { error: "Access denied to one or more target issue workspaces" },
        { status: 403 }
      );
    }

    // Create a map of original ID/key to resolved database ID
    const idMap = new Map<string, string>();
    targetIssues.forEach(issue => {
      // Map both the database ID and issueKey to the database ID
      idMap.set(issue.id, issue.id);
      if (issue.issueKey) {
        idMap.set(issue.issueKey, issue.id);
      }
    });

    // Create relations - normalize CHILD to PARENT with reversed direction
    const relationData = relations.map((relation: any) => {
      const providedType = String(relation.relationType || '').toUpperCase();
      // Resolve the target issue ID (could be either database ID or issueKey)
      const resolvedTargetId = idMap.get(relation.targetIssueId) || relation.targetIssueId;
      
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
