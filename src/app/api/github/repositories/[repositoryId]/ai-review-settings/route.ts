import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';

interface RouteParams {
  params: Promise<{
    repositoryId: string;
  }>;
}

// GET - Get current AI review settings
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { repositoryId } = await params;

    // Verify repository exists and user has access
    const repository = await prisma.repository.findUnique({
      where: { id: repositoryId },
      select: {
        id: true,
        aiReviewEnabled: true,
        aiReviewAutoTrigger: true,
        project: {
          include: {
            workspace: {
              include: {
                members: {
                  where: { userId: user.id },
                },
              },
            },
          },
        },
      },
    });

    if (!repository || repository.project.workspace.members.length === 0) {
      return NextResponse.json({ error: 'Repository not found or access denied' }, { status: 404 });
    }

    return NextResponse.json({
      aiReviewEnabled: repository.aiReviewEnabled,
      aiReviewAutoTrigger: repository.aiReviewAutoTrigger,
    });
  } catch (error) {
    console.error('Error fetching AI review settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch AI review settings' },
      { status: 500 }
    );
  }
}

// PATCH - Update AI review settings
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { repositoryId } = await params;
    const body = await request.json();

    // Verify repository exists and user has access
    const repository = await prisma.repository.findUnique({
      where: { id: repositoryId },
      include: {
        project: {
          include: {
            workspace: {
              include: {
                members: {
                  where: { userId: user.id },
                },
              },
            },
          },
        },
      },
    });

    if (!repository || repository.project.workspace.members.length === 0) {
      return NextResponse.json({ error: 'Repository not found or access denied' }, { status: 404 });
    }

    // Validate input
    const updateData: { aiReviewEnabled?: boolean; aiReviewAutoTrigger?: boolean } = {};

    if (typeof body.aiReviewEnabled === 'boolean') {
      updateData.aiReviewEnabled = body.aiReviewEnabled;
    }

    if (typeof body.aiReviewAutoTrigger === 'boolean') {
      updateData.aiReviewAutoTrigger = body.aiReviewAutoTrigger;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Update repository
    const updatedRepository = await prisma.repository.update({
      where: { id: repositoryId },
      data: updateData,
      select: {
        id: true,
        aiReviewEnabled: true,
        aiReviewAutoTrigger: true,
      },
    });

    return NextResponse.json({
      success: true,
      settings: {
        aiReviewEnabled: updatedRepository.aiReviewEnabled,
        aiReviewAutoTrigger: updatedRepository.aiReviewAutoTrigger,
      },
    });
  } catch (error) {
    console.error('Error updating AI review settings:', error);
    return NextResponse.json(
      { error: 'Failed to update AI review settings' },
      { status: 500 }
    );
  }
}
