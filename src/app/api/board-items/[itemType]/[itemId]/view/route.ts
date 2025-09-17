import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { trackView, BoardItemType } from "@/lib/board-item-activity-service";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: { itemType: string; itemId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const _params = await params;
    const { itemType, itemId } = _params;

    // Validate item type
    const validItemTypes: Record<string, BoardItemType> = {
      'issue': 'ISSUE',
      'task': 'TASK',
      'milestone': 'MILESTONE', 
      'epic': 'EPIC',
      'story': 'STORY'
    };

    const boardItemType = validItemTypes[itemType.toLowerCase()];
    if (!boardItemType) {
      return NextResponse.json(
        { error: 'Invalid item type' }, 
        { status: 400 }
      );
    }

    // Verify the item exists and user has access
    let item = null;
    let workspaceId = null;

    switch (boardItemType) {
      case 'ISSUE':
        // Try to find by ID first, then by issueKey
        item = await prisma.issue.findFirst({
          where: { 
            OR: [
              { id: itemId },
              { issueKey: itemId }
            ]
          },
          select: { id: true, workspaceId: true },
        });
        workspaceId = item?.workspaceId;
        break;
      case 'TASK':
        item = await prisma.task.findUnique({
          where: { id: itemId },
          select: { id: true, workspaceId: true },
        });
        workspaceId = item?.workspaceId;
        break;
      case 'MILESTONE':
        item = await prisma.milestone.findUnique({
          where: { id: itemId },
          select: { id: true, workspaceId: true },
        });
        workspaceId = item?.workspaceId;
        break;
      case 'EPIC':
        item = await prisma.epic.findUnique({
          where: { id: itemId },
          select: { id: true, workspaceId: true },
        });
        workspaceId = item?.workspaceId;
        break;
      case 'STORY':
        item = await prisma.story.findUnique({
          where: { id: itemId },
          select: { id: true, workspaceId: true },
        });
        workspaceId = item?.workspaceId;
        break;
    }

    if (!item || !workspaceId) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      );
    }

    // Check if user has access to the workspace
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id } } },
        ],
      },
    });

    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Track the view using the actual database ID
    const activity = await trackView(
      boardItemType,
      item.id, // Use the actual database ID, not the issueKey
      session.user.id,
      workspaceId
    );

    return NextResponse.json({ 
      success: true,
      activity: activity ? {
        id: activity.id,
        action: activity.action,
        createdAt: activity.createdAt
      } : null
    });
  } catch (error) {
    console.error('Error tracking view:', error);
    return NextResponse.json(
      { error: 'Failed to track view' },
      { status: 500 }
    );
  }
}
