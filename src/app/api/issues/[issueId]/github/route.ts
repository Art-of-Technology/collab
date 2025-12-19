import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// GET /api/issues/[issueId]/github - Get GitHub integration data for an issue
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { issueId } = await params;

    // Verify user has access to the issue
    const issue = await prisma.issue.findFirst({
      where: {
        id: issueId,
        project: {
          workspace: {
            OR: [
              { ownerId: session.user.id },
              { members: { some: { userId: session.user.id } } },
            ],
          },
        },
      },
      include: {
        project: {
          include: {
            repository: true,
          },
        },
      },
    });

    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    if (!issue.project.repository) {
      return NextResponse.json({
        repository: null,
        branch: null,
        pullRequests: [],
        versions: [],
        commits: [],
      });
    }

    const repository = issue.project.repository;

    // Get GitHub data related to this issue
    const [branch, pullRequests, versions, commits] = await Promise.all([
      // Find branch linked to this issue
      prisma.branch.findFirst({
        where: {
          repositoryId: repository.id,
          issueId: issue.id,
        },
      }),

      // Find pull requests linked to this issue
      prisma.pullRequest.findMany({
        where: {
          repositoryId: repository.id,
          issueId: issue.id,
        },
        include: {
          checks: true,
          reviews: {
            include: {
              reviewer: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
            },
            orderBy: { submittedAt: 'desc' },
          },
          aiReviews: {
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
          },
        },
        orderBy: { githubUpdatedAt: 'desc' },
      }),

      // Find versions that include this issue
      prisma.version.findMany({
        where: {
          repositoryId: repository.id,
          issues: {
            some: {
              issueId: issue.id,
            },
          },
        },
        include: {
          deployments: {
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),

      // Find commits linked to this issue
      prisma.commit.findMany({
        where: {
          repositoryId: repository.id,
          issueId: issue.id,
        },
        orderBy: { commitDate: 'desc' },
        take: 10,
      }),
    ]);

    // Enrich pull requests with GitHub URLs
    const enrichedPullRequests = pullRequests.map(pr => ({
      ...pr,
      githubUrl: `https://github.com/${repository.fullName}/pull/${pr.githubPrId}`,
    }));

    // Enrich commits with GitHub URLs
    const enrichedCommits = commits.map(commit => ({
      ...commit,
      githubUrl: `https://github.com/${repository.fullName}/commit/${commit.sha}`,
    }));

    return NextResponse.json({
      repository: {
        id: repository.id,
        fullName: repository.fullName,
        owner: repository.owner,
        name: repository.name,
        aiReviewEnabled: repository.aiReviewEnabled,
      },
      branch,
      pullRequests: enrichedPullRequests,
      versions,
      commits: enrichedCommits,
    });
  } catch (error) {
    console.error('[ISSUE_GITHUB_GET]', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
