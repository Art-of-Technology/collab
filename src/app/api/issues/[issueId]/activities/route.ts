import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { issueReadAccessWhere } from '@/lib/issue-finder';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
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
    const descriptionOnly = searchParams.get('descriptionOnly') === 'true';
    const limit = limitStr ? parseInt(limitStr, 10) : 50;

    // The issue read rule, as on the issue itself: an issue this user may not read is answered as not found.
    const issue = await prisma.issue.findFirst({
      where: { id: issueId, ...issueReadAccessWhere(session.user.id) },
      select: { id: true },
    });

    if (!issue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
    }

    // Fetch activities for this issue
    const activities = await prisma.issueActivity.findMany({
      where: {
        itemId: issueId,
        ...(action ? { action } : {}),
        ...(descriptionOnly ? {
          OR: [
            { action: { in: ['DESCRIPTION_CHANGED', 'DESCRIPTION_UPDATED'] } },
            { action: 'UPDATED', fieldName: 'description' },
          ],
        } : {}),
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
        oldStatus: {
          select: {
            id: true,
            name: true,
            displayName: true,
            color: true,
            iconName: true,
          },
        },
        newStatus: {
          select: {
            id: true,
            name: true,
            displayName: true,
            color: true,
            iconName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    // Whose allowance each run used (CLB-779): the first name of its seat's owner and the program its runner reported.
    // A run whose seat has no owner (an API-key seat) or no seat (a person's own run) shows none.
    const parsed = activities.map(activity => ({ activity, details: activity.details ? JSON.parse(activity.details) : null }));
    const isRun = (action: string) => action === 'AGENT_RUN_FINISHED' || action === 'AGENT_RUN_LOST';
    const runIds = parsed.filter(({ activity, details }) => isRun(activity.action) && typeof details?.runId === 'string').map(({ details }) => details.runId as string);
    const runs = runIds.length ? await prisma.agentRun.findMany({ where: { id: { in: runIds }, issueId },
      select: { id: true, program: true, seat: { select: { owner: { select: { name: true } } } } } }) : [];
    const allowanceOf = (runId: unknown) => {
      const run = runs.find(found => found.id === runId);
      const owner = run?.seat?.owner?.name?.trim().split(/\s+/)[0];
      return run && owner ? { owner, program: run.program } : null;
    };

    // Transform to expected format
    const formattedActivities = parsed.map(({ activity, details }) => ({
      id: activity.id,
      action: activity.action,
      details,
      ...(isRun(activity.action) && { allowance: allowanceOf(details?.runId) }),
      createdAt: activity.createdAt.toISOString(),
      fieldName: activity.fieldName,
      oldValue: activity.oldValue,
      newValue: activity.newValue,
      oldStatus: activity.oldStatus || null,
      newStatus: activity.newStatus || null,
      user: activity.user,
    }));

    return NextResponse.json(formattedActivities);
  } catch (error) {
    console.error('Error fetching issue activities:', error);
    return NextResponse.json({ error: 'Failed to fetch activities' }, { status: 500 });
  }
}
