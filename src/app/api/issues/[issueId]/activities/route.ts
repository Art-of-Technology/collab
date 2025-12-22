import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: { issueId: string } }
) {
  const _params = await params;
  const { issueId } = _params;

  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limitStr = searchParams.get('limit');
    const action = searchParams.get('action');
    const limit = limitStr ? parseInt(limitStr, 10) : 50;

    // Find the issue to verify access
    const issue = await prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        workspaceId: true,
      },
    });

    if (!issue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
    }

    // Check workspace membership
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: session.user.id,
          workspaceId: issue.workspaceId,
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 });
    }

    // Fetch activities for this issue
    const activities = await prisma.issueActivity.findMany({
      where: {
        itemId: issueId,
        ...(action ? { action } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
            useCustomAvatar: true,
            avatarSkinTone: true,
            avatarEyes: true,
            avatarBrows: true,
            avatarMouth: true,
            avatarNose: true,
            avatarHair: true,
            avatarEyewear: true,
            avatarAccessory: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    // Transform to expected format
    const formattedActivities = activities.map((activity) => ({
      id: activity.id,
      action: activity.action,
      details: activity.details ? JSON.parse(activity.details) : null,
      createdAt: activity.createdAt.toISOString(),
      fieldName: activity.fieldName,
      oldValue: activity.oldValue,
      newValue: activity.newValue,
      user: activity.user,
    }));

    return NextResponse.json(formattedActivities);
  } catch (error) {
    console.error('Error fetching issue activities:', error);
    return NextResponse.json({ error: 'Failed to fetch activities' }, { status: 500 });
  }
}
