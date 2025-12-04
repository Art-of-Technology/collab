import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { verifyWorkspaceAccess } from '@/lib/workspace-helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; entryId: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId, entryId } = await params;
    await verifyWorkspaceAccess(session.user, workspaceId);

    const entry = await prisma.dailyFocusEntry.findFirst({
      where: {
        id: entryId,
        workspaceId,
      },
      include: {
        reflections: {
          include: {
            issue: {
              include: {
                assignee: true,
                reporter: true,
                project: true,
                projectStatus: true,
              },
            },
          },
        },
        plans: {
          include: {
            issue: {
              include: {
                assignee: true,
                reporter: true,
                project: true,
                projectStatus: true,
              },
            },
          },
        },
        assignments: {
          include: {
            issue: {
              include: {
                assignee: true,
                reporter: true,
                project: true,
                projectStatus: true,
              },
            },
            assignedTo: true,
            assignedBy: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    if (!entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    return NextResponse.json({ entry });
  } catch (error: any) {
    console.error('Error fetching daily focus entry:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch daily focus entry' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; entryId: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId, entryId } = await params;
    await verifyWorkspaceAccess(session.user, workspaceId);

    const body = await request.json();
    const { reflections, plans, assignments, status } = body;

    const existing = await prisma.dailyFocusEntry.findFirst({
      where: {
        id: entryId,
        workspaceId,
        userId: session.user.id,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    // If submitted, don't allow updates
    if (existing.status === 'SUBMITTED' && status !== 'SUBMITTED') {
      return NextResponse.json(
        { error: 'Cannot update submitted entry' },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (status) {
      updateData.status = status;
      if (status === 'SUBMITTED') {
        updateData.submittedAt = new Date();
      }
    }

    const entry = await prisma.dailyFocusEntry.update({
      where: { id: entryId },
      data: {
        ...updateData,
        reflections: {
          deleteMany: {},
          create: reflections?.map((r: any) => ({
            issueId: r.issueId,
            status: r.status,
            notes: r.notes,
          })) || [],
        },
        plans: {
          deleteMany: {},
          create: plans?.map((p: any) => ({
            issueId: p.issueId,
            notes: p.notes,
          })) || [],
        },
        assignments: {
          deleteMany: {},
          create: assignments?.map((a: any) => ({
            issueId: a.issueId,
            assignedToId: a.assignedToId,
            assignedById: session.user.id,
            notes: a.notes,
          })) || [],
        },
      },
      include: {
        reflections: {
          include: {
            issue: {
              include: {
                assignee: true,
                reporter: true,
                project: true,
                projectStatus: true,
              },
            },
          },
        },
        plans: {
          include: {
            issue: {
              include: {
                assignee: true,
                reporter: true,
                project: true,
                projectStatus: true,
              },
            },
          },
        },
        assignments: {
          include: {
            issue: {
              include: {
                assignee: true,
                reporter: true,
                project: true,
                projectStatus: true,
              },
            },
            assignedTo: true,
            assignedBy: true,
          },
        },
      },
    });

    return NextResponse.json({ entry });
  } catch (error: any) {
    console.error('Error updating daily focus entry:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update daily focus entry' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; entryId: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId, entryId } = await params;
    await verifyWorkspaceAccess(session.user, workspaceId);

    const existing = await prisma.dailyFocusEntry.findFirst({
      where: {
        id: entryId,
        workspaceId,
        userId: session.user.id,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    // Only allow deletion of draft entries
    if (existing.status === 'SUBMITTED') {
      return NextResponse.json(
        { error: 'Cannot delete submitted entry' },
        { status: 400 }
      );
    }

    await prisma.dailyFocusEntry.delete({
      where: { id: entryId },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting daily focus entry:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete daily focus entry' },
      { status: 500 }
    );
  }
}

