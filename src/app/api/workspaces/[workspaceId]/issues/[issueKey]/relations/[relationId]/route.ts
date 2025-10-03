import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { findIssueByIdOrKey } from "@/lib/issue-finder";

// DELETE /api/workspaces/[workspaceId]/issues/[issueKey]/relations/[relationId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; issueKey: string; relationId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId, issueKey, relationId } = await params;

    // Resolve workspace by ID
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        members: { some: { userId: session.user.id } }
      }
    });

    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace not found or access denied" },
        { status: 404 }
      );
    }

    // Find the issue
    const issue = await findIssueByIdOrKey(issueKey, {
      workspaceId: workspace.id,
      userId: session.user.id
    });

    if (!issue) {
      return NextResponse.json(
        { error: "Issue not found" },
        { status: 404 }
      );
    }

    // Find the relation and verify it belongs to this issue
    const relation = await prisma.issueRelation.findFirst({
      where: {
        id: relationId,
        OR: [
          { sourceIssueId: issue.id },
          { targetIssueId: issue.id }
        ]
      }
    });

    if (!relation) {
      return NextResponse.json(
        { error: "Relation not found" },
        { status: 404 }
      );
    }

    // Delete the relation
    await prisma.issueRelation.delete({
      where: { id: relationId }
    });

    return NextResponse.json({ 
      success: true, 
      message: "Relation deleted successfully" 
    });

  } catch (error) {
    console.error("Error deleting relation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
