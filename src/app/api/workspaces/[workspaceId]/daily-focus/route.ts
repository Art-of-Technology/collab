import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { verifyWorkspaceAccess } from '@/lib/workspace-helpers';

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
    const dateParam = searchParams.get('date');
    const userId = searchParams.get('userId') || session.user.id;

    // Default to today if no date provided
    let date: Date;
    if (dateParam) {
      // Parse date string (YYYY-MM-DD format)
      date = new Date(dateParam + 'T00:00:00');
    } else {
      date = new Date();
      date.setHours(0, 0, 0, 0);
    }

    const entry = await prisma.dailyFocusEntry.findUnique({
      where: {
        userId_workspaceId_date: {
          userId,
          workspaceId,
          date,
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

    return NextResponse.json({ entry });
  } catch (error: any) {
    console.error('Error fetching daily focus entry:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch daily focus entry' },
      { status: 500 }
    );
  }
}

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
    const { date, reflections, plans, assignments } = body;

    let entryDate: Date;
    if (date) {
      // Parse date string (YYYY-MM-DD format)
      entryDate = new Date(date + 'T00:00:00');
    } else {
      entryDate = new Date();
      entryDate.setHours(0, 0, 0, 0);
    }

    // Check if entry already exists
    const existing = await prisma.dailyFocusEntry.findUnique({
      where: {
        userId_workspaceId_date: {
          userId: session.user.id,
          workspaceId,
          date: entryDate,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Entry already exists for this date' },
        { status: 400 }
      );
    }

    const entry = await prisma.dailyFocusEntry.create({
      data: {
        userId: session.user.id,
        workspaceId,
        date: entryDate,
        status: 'DRAFT',
        reflections: {
          create: reflections?.map((r: any) => ({
            issueId: r.issueId,
            status: r.status,
            notes: r.notes,
          })) || [],
        },
        plans: {
          create: plans?.map((p: any) => ({
            issueId: p.issueId,
            notes: p.notes,
          })) || [],
        },
        assignments: {
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

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating daily focus entry:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create daily focus entry' },
      { status: 500 }
    );
  }
}

export async function PUT(
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
    const { date, reflections, plans, assignments, status } = body;

    let entryDate: Date;
    if (date) {
      // Parse date string (YYYY-MM-DD format)
      entryDate = new Date(date + 'T00:00:00');
    } else {
      entryDate = new Date();
      entryDate.setHours(0, 0, 0, 0);
    }

    let existing = await prisma.dailyFocusEntry.findUnique({
      where: {
        userId_workspaceId_date: {
          userId: session.user.id,
          workspaceId,
          date: entryDate,
        },
      },
    });

    // If entry doesn't exist, create it
    if (!existing) {
      existing = await prisma.dailyFocusEntry.create({
        data: {
          userId: session.user.id,
          workspaceId,
          date: entryDate,
          status: status || 'DRAFT',
        },
      });
    } else {
      // If submitted, don't allow updates unless we're just resubmitting
      if (existing.status === 'SUBMITTED' && status && status !== 'SUBMITTED') {
        return NextResponse.json(
          { error: 'Cannot update submitted entry' },
          { status: 400 }
        );
      }
    }

    // Update entry
    const updateData: any = {};
    if (status) {
      updateData.status = status;
      if (status === 'SUBMITTED') {
        updateData.submittedAt = new Date();
      }
    }

    const entry = await prisma.dailyFocusEntry.update({
      where: { id: existing.id },
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

