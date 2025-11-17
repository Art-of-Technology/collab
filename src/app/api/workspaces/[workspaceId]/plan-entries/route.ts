import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { verifyWorkspaceAccess } from '@/lib/workspace-helpers';
import { prisma } from '@/lib/prisma';
import { addToPlan, removeFromPlan, getManualPlanEntries } from '@/utils/teamSyncAnalyzerImproved';

/**
 * GET - List manual plan entries
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId } = await params;
    await verifyWorkspaceAccess(session.user, workspaceId);

    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const userIdsParam = searchParams.get('userIds');

    const startDate = startDateParam ? new Date(startDateParam) : new Date();
    const endDate = endDateParam ? new Date(endDateParam) : new Date();
    const userIds = userIdsParam ? userIdsParam.split(',') : undefined;

    const entries = await getManualPlanEntries(workspaceId, startDate, endDate, userIds);

    return NextResponse.json({ entries });
  } catch (error: any) {
    console.error('Error fetching plan entries:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch plan entries' },
      { status: 500 }
    );
  }
}

/**
 * POST - Add issue to someone's plan
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId } = await params;
    await verifyWorkspaceAccess(session.user, workspaceId);

    const body = await request.json();
    const { userId, issueId, date, notes } = body;

    if (!userId || !issueId || !date) {
      return NextResponse.json(
        { error: 'userId, issueId, and date are required' },
        { status: 400 }
      );
    }

    // Verify issue belongs to workspace
    const issue = await prisma.issue.findFirst({
      where: {
        id: issueId,
        workspaceId,
      },
    });

    if (!issue) {
      return NextResponse.json(
        { error: 'Issue not found in workspace' },
        { status: 404 }
      );
    }

    // Verify user belongs to workspace
    const workspaceMember = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId,
      },
    });

    if (!workspaceMember) {
      return NextResponse.json(
        { error: 'User not found in workspace' },
        { status: 404 }
      );
    }

    await addToPlan(userId, issueId, new Date(date), notes, session.user.id);

    return NextResponse.json({
      success: true,
      message: 'Issue added to plan',
    });
  } catch (error: any) {
    console.error('Error adding to plan:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to add to plan' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Remove issue from plan
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId } = await params;
    await verifyWorkspaceAccess(session.user, workspaceId);

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const issueId = searchParams.get('issueId');
    const dateParam = searchParams.get('date');

    if (!userId || !issueId || !dateParam) {
      return NextResponse.json(
        { error: 'userId, issueId, and date are required' },
        { status: 400 }
      );
    }

    await removeFromPlan(userId, issueId, new Date(dateParam));

    return NextResponse.json({
      success: true,
      message: 'Issue removed from plan',
    });
  } catch (error: any) {
    console.error('Error removing from plan:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to remove from plan' },
      { status: 500 }
    );
  }
}


