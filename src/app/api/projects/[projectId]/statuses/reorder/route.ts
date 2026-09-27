import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import { prisma } from '@/lib/prisma';

class ReorderAccessChanged extends Error {}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const actor = await getCurrentUser();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();

    const updates = Array.isArray(body?.updates) ? body.updates : null;
    if (!updates || updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    // Verify project and access
    const projectWhere = { id: projectId, workspace: postWorkspaceAccessWhere(actor.id) };
    const project = await prisma.project.findFirst({
      where: projectWhere,
      select: { id: true }
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Accept either { id, order } or { name, order }
    type Update = { id?: string; name?: string; order: number };
    const normalized: Update[] = updates.map((u: any) => ({ id: u.id, name: u.name, order: Number(u.order) }));

    await prisma.$transaction(async (tx) => {
      if (!await tx.project.findFirst({ where: projectWhere, select: { id: true } })) {
        throw new ReorderAccessChanged();
      }
      for (const u of normalized) {
        if (u.id) {
          const updated = await tx.projectStatus.updateMany({
            where: { id: u.id, projectId, project: projectWhere },
            data: { order: u.order }
          });
          if (updated.count !== 1) throw new ReorderAccessChanged();
        } else if (u.name) {
          await tx.projectStatus.updateMany({
            where: { projectId, name: u.name, project: projectWhere },
            data: { order: u.order }
          });
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ReorderAccessChanged) {
      return NextResponse.json({ error: 'Status not in project or access changed' }, { status: 409 });
    }
    console.error('Error reordering project statuses:', error);
    return NextResponse.json({ error: 'Failed to reorder statuses' }, { status: 500 });
  }
}

