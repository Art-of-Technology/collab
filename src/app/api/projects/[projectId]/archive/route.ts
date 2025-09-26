import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { isArchived } = await request.json();

    // Update project archive status
    const project = await prisma.project.update({
      where: {
        id: projectId,
      },
      data: {
        isArchived: isArchived,
        updatedAt: new Date(),
      },
      include: {
        _count: {
          select: {
            issues: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      project,
    });
  } catch (error) {
    console.error('Error updating project archive status:', error);
    return NextResponse.json(
      { error: 'Failed to update project archive status' },
      { status: 500 }
    );
  }
}
