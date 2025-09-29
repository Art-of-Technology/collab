import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { publishEvent } from '@/lib/redis';
import { VIEW_POSITIONS_MAX_BULK_SIZE } from '@/constants/viewPositions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// PUT /api/views/[viewId]/issue-positions
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ viewId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const { viewId } = resolvedParams;
    const body = await request.json();
    const { issueId, columnId, position, bulk, cleanup, batchId, sequence } = body as any;

    // Verify view access
    const view = await prisma.view.findFirst({
      where: {
        id: viewId,
        OR: [
          { ownerId: currentUser.id },
          { visibility: 'SHARED' },
          { visibility: 'WORKSPACE' }
        ]
      }
    });

    if (!view) {
      return NextResponse.json({ error: 'View not found or access denied' }, { status: 404 });
    }

    // Bulk upsert support for reindex operations (with optional cleanup of stale positions)
    if (Array.isArray(bulk) && bulk.length > 0) {
      // Validate payload shape and size early
      if (bulk.length > VIEW_POSITIONS_MAX_BULK_SIZE) {
        return NextResponse.json({ error: `Bulk size exceeds limit (max ${VIEW_POSITIONS_MAX_BULK_SIZE}).` }, { status: 400 });
      }

      // Validate all items are well-formed and positions are finite integers
      for (const item of bulk) {
        if (!item || typeof item.issueId !== 'string' || typeof item.columnId !== 'string' || item.position === undefined) {
          return NextResponse.json({ error: 'Invalid bulk item: issueId, columnId, and position are required.' }, { status: 400 });
        }
        if (!Number.isFinite(item.position) || !Number.isInteger(item.position) || item.position < 0) {
          return NextResponse.json({ error: `Invalid position for issue ${item.issueId}. Position must be a non-negative integer.` }, { status: 400 });
        }
      }

      // Access check: ensure all issues belong to the same workspace and user has access
      const uniqueIssueIds = Array.from(new Set(bulk.map((b: any) => b.issueId)));
      const accessibleIssues = await prisma.issue.findMany({
        where: {
          id: { in: uniqueIssueIds },
          workspaceId: view.workspaceId,
          workspace: { members: { some: { userId: currentUser.id } } }
        },
        select: { id: true }
      });
      if (accessibleIssues.length !== uniqueIssueIds.length) {
        return NextResponse.json({ error: 'One or more issues not found or access denied.' }, { status: 404 });
      }

      // Use a single transaction for atomic batch operations
      await prisma.$transaction(async (tx) => {
        // Optional cleanup: remove old assignments for provided issues outside the destination column
        if (cleanup?.issueIds?.length && cleanup?.keepColumnId) {
          await tx.viewIssuePosition.deleteMany({
            where: {
              viewId,
              issueId: { in: cleanup.issueIds as string[] },
              columnId: { not: cleanup.keepColumnId as string }
            }
          });
        }

        // Batch upsert all positions in a single operation for better performance
        await Promise.all(
          bulk.map((item: any) =>
            tx.viewIssuePosition.upsert({
              where: {
                viewId_issueId_columnId: {
                  viewId,
                  issueId: item.issueId,
                  columnId: item.columnId
                }
              },
              update: { 
                position: item.position,
                updatedAt: new Date()
              },
              create: {
                viewId,
                issueId: item.issueId,
                columnId: item.columnId,
                position: item.position
              }
            })
          )
        );
      });
      // Only publish event once per batch (not per individual issue)
      // Include sequence number for proper request ordering
      await publishEvent(`workspace:${view.workspaceId}:events`, {
        type: 'view.issue-position.updated',
        workspaceId: view.workspaceId,
        viewId,
        batchId: batchId || `single-${Date.now()}`,
        sequence: sequence || 0,
        affectedIssues: bulk.map((item: any) => item.issueId),
        timestamp: Date.now(),
        userId: currentUser.id // Add user context to distinguish actions
      });
      
      return NextResponse.json({ 
        success: true, 
        batchId,
        affectedCount: bulk.length 
      });
    }

    if (!issueId || !columnId || position === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: issueId, columnId, position' },
        { status: 400 }
      );
    }

    // Verify issue exists and user has access (single update path)
    const issue = await prisma.issue.findFirst({
      where: {
        id: issueId,
        workspace: {
          members: {
            some: { userId: currentUser.id }
          }
        }
      }
    });

    if (!issue) {
      return NextResponse.json({ error: 'Issue not found or access denied' }, { status: 404 });
    }

    // Upsert single view-specific position
    const viewPosition = await prisma.viewIssuePosition.upsert({
      where: {
        viewId_issueId_columnId: {
          viewId,
          issueId,
          columnId
        }
      },
      update: {
        position: position
      },
      create: {
        viewId,
        issueId,
        columnId,
        position: position
      }
    });

    await publishEvent(`workspace:${view.workspaceId}:events`, {
      type: 'view.issue-position.updated',
      workspaceId: view.workspaceId,
      viewId,
      issueId,
      columnId,
      position,
      userId: currentUser.id // Add user context to distinguish actions
    });

    return NextResponse.json({ success: true, viewPosition });

  } catch (error) {
    console.error('Error updating view issue position:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/views/[viewId]/issue-positions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ viewId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const { viewId } = resolvedParams;

    // Verify view access
    const view = await prisma.view.findFirst({
      where: {
        id: viewId,
        OR: [
          { ownerId: currentUser.id },
          { visibility: 'SHARED' },
          { visibility: 'WORKSPACE' }
        ]
      }
    });

    if (!view) {
      return NextResponse.json({ error: 'View not found or access denied' }, { status: 404 });
    }

    // Get all view-specific positions
    const positions = await prisma.viewIssuePosition.findMany({
      where: { viewId },
      include: {
        issue: {
          select: {
            id: true,
            title: true,
            issueKey: true
          }
        }
      },
      orderBy: [
        { columnId: 'asc' },
        { position: 'asc' }
      ]
    });

    return NextResponse.json({ positions });

  } catch (error) {
    console.error('Error fetching view issue positions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}