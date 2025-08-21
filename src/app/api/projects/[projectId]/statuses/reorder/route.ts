import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();

    const updates = Array.isArray(body?.updates) ? body.updates : null;
    if (!updates || updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    // Verify project and access
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true }
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const member = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId: project.workspaceId,
        user: { email: session.user.email }
      }
    });
    if (!member) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Accept either { id, order } or { name, order }
    type Update = { id?: string; name?: string; order: number };
    const normalized: Update[] = updates.map((u: any) => ({ id: u.id, name: u.name, order: Number(u.order) }));

    await prisma.$transaction(async (tx) => {
      for (const u of normalized) {
        if (u.id) {
          await tx.projectStatus.update({
            where: { id: u.id },
            data: { order: u.order }
          });
        } else if (u.name) {
          await tx.projectStatus.updateMany({
            where: { projectId, name: u.name },
            data: { order: u.order }
          });
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error reordering project statuses:', error);
    return NextResponse.json({ error: 'Failed to reorder statuses' }, { status: 500 });
  }
}


