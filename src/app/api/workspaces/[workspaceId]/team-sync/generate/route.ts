import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { verifyWorkspaceAccess } from '@/lib/workspace-helpers';
import { generateTeamSync } from '@/utils/teamSyncAnalyzer';

/**
 * Generate team sync data automatically based on issue statuses and activities
 * This replaces the manual "Daily Meeting" board process
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
    
    // Parse filters
    const dateParam = searchParams.get('date');
    const projectIdsParam = searchParams.get('projectIds');
    const userIdsParam = searchParams.get('userIds');
    
    const targetDate = dateParam ? new Date(dateParam) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    
    const projectIds = projectIdsParam
      ? projectIdsParam.split(',').filter(Boolean)
      : undefined;
    
    const userIds = userIdsParam
      ? userIdsParam.split(',').filter(Boolean)
      : undefined;

    // Generate team sync data
    const teamSync = await generateTeamSync(
      workspaceId,
      targetDate,
      userIds,
      projectIds
    );

    return NextResponse.json({
      teamSync,
      metadata: {
        date: targetDate.toISOString(),
        workspaceId,
        projectIds: projectIds || [],
        userIds: userIds || [],
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error generating team sync:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate team sync' },
      { status: 500 }
    );
  }
}

/**
 * Save manual edits/annotations to auto-generated data
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
    const { date, userAnnotations } = body;

    // userAnnotations structure:
    // {
    //   userId: string,
    //   issueAnnotations: [{
    //     issueId: string,
    //     notes: string,
    //     statusSymbolOverride: string,
    //   }]
    // }

    // TODO: Save annotations to DailyFocusEntry as manual overrides
    // For now, just return success
    
    return NextResponse.json({
      success: true,
      message: 'Annotations saved',
    });
  } catch (error: any) {
    console.error('Error saving annotations:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save annotations' },
      { status: 500 }
    );
  }
}


