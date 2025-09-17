import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { publishEvent } from '@/lib/redis';

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
    const { issueId, columnId, position, bulk, cleanup } = body as any;

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

        for (const item of bulk) {
          if (!item.issueId || !item.columnId || item.position === undefined) {
            throw new Error('Invalid bulk item');
          }
          await tx.viewIssuePosition.upsert({
            where: {
              viewId_issueId_columnId: {
                viewId,
                issueId: item.issueId,
                columnId: item.columnId
              }
            },
            update: { position: item.position },
            create: {
              viewId,
              issueId: item.issueId,
              columnId: item.columnId,
              position: item.position
            }
          });
        }
      });
      await publishEvent(`workspace:${view.workspaceId}:events`, {
        type: 'view.issue-position.updated',
        workspaceId: view.workspaceId,
        viewId,
      });
      return NextResponse.json({ success: true });
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
      position
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