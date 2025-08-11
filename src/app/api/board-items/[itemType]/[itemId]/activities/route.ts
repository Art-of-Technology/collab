import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getItemActivities, BoardItemType } from "@/lib/board-item-activity-service";
import { prisma } from "@/lib/prisma";

export async function GET(
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
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // Validate item type (include ISSUE for unified model)
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
        item = await prisma.issue.findUnique({
          where: { id: itemId },
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

    // Get activities for the item
    const activities = await getItemActivities(boardItemType, itemId, limit);

    return NextResponse.json(activities);
  } catch (error) {
    console.error('Error fetching board item activities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activities' },
      { status: 500 }
    );
  }
} 