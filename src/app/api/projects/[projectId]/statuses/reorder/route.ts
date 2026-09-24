import { userHasWorkspaceAccess } from '@/lib/issue-finder';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/request-session';
import { authConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user?.id) {
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

    const member = await userHasWorkspaceAccess(session.user.id, project.workspaceId);
    if (!member) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Accept either { id, order } or { name, order }
    type Update = { id?: string; name?: string; order: number };
    const normalized: Update[] = updates.map((u: any) => ({ id: u.id, name: u.name, order: Number(u.order) }));

    if (normalized.some(u => (!u.id && !u.name) || !Number.isFinite(u.order))) {
      return NextResponse.json({ error: 'Invalid status update' }, { status: 400 });
    }
    const ids = [...new Set(normalized.flatMap(u => u.id ? [u.id] : []))];
    const count = await prisma.projectStatus.count({ where: { projectId, id: { in: ids } } });
    if (count !== ids.length) {
      return NextResponse.json({ error: 'Status does not belong to project' }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      for (const u of normalized) {
        if (u.id) {
          await tx.projectStatus.update({
            where: { id: u.id, projectId },
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


