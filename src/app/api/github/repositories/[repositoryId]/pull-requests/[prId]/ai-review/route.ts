import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { aiPRReviewService } from '@/lib/github/ai-pr-review-service';
import { AIPRReviewTrigger } from '@prisma/client';

interface RouteParams {
  params: Promise<{
    repositoryId: string;
    prId: string;
  }>;
}

// GET - Get AI reviews for a specific PR
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { repositoryId, prId } = await params;

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

    // Get pull request
    const pullRequest = await prisma.pullRequest.findFirst({
      where: {
        repositoryId,
        OR: [
          { id: prId },
          { githubPrId: parseInt(prId) || 0 },
        ],
      },
    });

    if (!pullRequest) {
      return NextResponse.json({ error: 'Pull request not found' }, { status: 404 });
    }

    // Get AI reviews for this PR
    const aiReviews = await prisma.aIPRReview.findMany({
      where: { pullRequestId: pullRequest.id },
      include: {
        triggeredBy: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ reviews: aiReviews });
  } catch (error) {
    console.error('Error fetching AI reviews:', error);
    return NextResponse.json(
      { error: 'Failed to fetch AI reviews' },
      { status: 500 }
    );
  }
}

// POST - Trigger AI review for a PR
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { repositoryId, prId } = await params;

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

    // Check if AI review is enabled
    if (!repository.aiReviewEnabled) {
      return NextResponse.json(
        { error: 'AI Review is not enabled for this repository. Enable it in GitHub settings.' },
        { status: 400 }
      );
    }

    // Get pull request
    const pullRequest = await prisma.pullRequest.findFirst({
      where: {
        repositoryId,
        OR: [
          { id: prId },
          { githubPrId: parseInt(prId) || 0 },
        ],
      },
    });

    if (!pullRequest) {
      return NextResponse.json({ error: 'Pull request not found' }, { status: 404 });
    }

    // Check if there's already an in-progress review
    const existingReview = await prisma.aIPRReview.findFirst({
      where: {
        pullRequestId: pullRequest.id,
        status: { in: ['PENDING', 'ANALYZING'] },
      },
    });

    if (existingReview) {
      return NextResponse.json(
        { error: 'A review is already in progress for this PR', reviewId: existingReview.id },
        { status: 409 }
      );
    }

    // Perform the review
    const result = await aiPRReviewService.performReview(
      pullRequest.id,
      AIPRReviewTrigger.MANUAL,
      user.id
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to perform AI review', reviewId: result.reviewId },
        { status: 500 }
      );
    }

    // Get the created review
    const review = await prisma.aIPRReview.findUnique({
      where: { id: result.reviewId },
      include: {
        triggeredBy: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      review,
      message: review?.postedToGitHub
        ? 'Review completed and posted to GitHub'
        : 'Review completed (not posted to GitHub)'
    });
  } catch (error) {
    console.error('Error triggering AI review:', error);
    return NextResponse.json(
      { error: 'Failed to trigger AI review' },
      { status: 500 }
    );
  }
}
