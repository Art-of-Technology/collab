import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { verifyWorkspaceAccess } from '@/lib/workspace-helpers';
import { generateTeamRangeSync, getActivityFeed } from '@/utils/teamSyncAnalyzer';

/**
 * Generate team sync data for a date range
 * Provides day-by-day breakdown of team activity with issue movements
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
    
    // Parse date range parameters
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const projectIdsParam = searchParams.get('projectIds');
    const userIdsParam = searchParams.get('userIds');
    const mode = searchParams.get('mode') || 'range'; // 'range' | 'feed'
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    // Default to last 7 days if no dates provided
    const endDate = endDateParam ? new Date(endDateParam) : new Date();
    endDate.setHours(23, 59, 59, 999);
    
    const startDate = startDateParam 
      ? new Date(startDateParam) 
      : new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    startDate.setHours(0, 0, 0, 0);

    const projectIds = projectIdsParam
      ? projectIdsParam.split(',').filter(Boolean)
      : undefined;
    
    const userIds = userIdsParam
      ? userIdsParam.split(',').filter(Boolean)
      : undefined;

    // Activity feed mode - returns chronological list of movements
    if (mode === 'feed') {
      const feed = await getActivityFeed(
        workspaceId,
        startDate,
        endDate,
        userIds,
        projectIds,
        limit
      );

      return NextResponse.json({
        feed,
        metadata: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          workspaceId,
          projectIds: projectIds || [],
          userIds: userIds || [],
          count: feed.length,
          generatedAt: new Date().toISOString(),
        },
      });
    }

    // Range mode - returns full team sync with day-by-day breakdown
    const rangeSync = await generateTeamRangeSync(
      workspaceId,
      startDate,
      endDate,
      userIds,
      projectIds
    );

    return NextResponse.json({
      ...rangeSync,
      metadata: {
        workspaceId,
        projectIds: projectIds || [],
        userIds: userIds || [],
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error generating team range sync:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate team range sync' },
      { status: 500 }
    );
  }
}

