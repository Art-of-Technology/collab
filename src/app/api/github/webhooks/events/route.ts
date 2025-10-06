import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { GitHubWebhookService } from "@/lib/github/webhook-service";
import { VersionManager } from "@/lib/github/version-manager";

// POST /api/github/webhooks/events - Handle GitHub webhook events
export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get('x-hub-signature-256');
    const event = request.headers.get('x-github-event');
    const delivery = request.headers.get('x-github-delivery');

    if (!signature || !event || !delivery) {
      return NextResponse.json(
        { error: "Missing required webhook headers" },
        { status: 400 }
      );
    }

    const body = await request.text();
    const payload = JSON.parse(body);

    // Verify webhook signature
    const isValid = await verifyWebhookSignature(signature, body, payload.repository?.id);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Initialize services
    const webhookService = new GitHubWebhookService();
    const versionManager = new VersionManager();

    // Handle different GitHub events
    switch (event) {
      case 'push':
        await handlePushEvent(payload, webhookService, versionManager);
        break;

      case 'pull_request':
        await handlePullRequestEvent(payload, webhookService, versionManager);
        break;


      case 'check_run':
      case 'check_suite':
        await handleCheckEvent(payload, webhookService);
        break;

      case 'release':
        await handleReleaseEvent(payload, webhookService, versionManager);
        break;

      case 'create':
      case 'delete':
        if (payload.ref_type === 'branch') {
          await handleBranchEvent(payload, webhookService, event);
        }
        break;

      default:
        console.log(`Unhandled GitHub event: ${event}`);
    }

    return NextResponse.json({ success: true, event, delivery });
  } catch (error) {
    console.error('[GITHUB_WEBHOOK]', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Handle push events (commits)
async function handlePushEvent(
  payload: any,
  webhookService: GitHubWebhookService,
  versionManager: VersionManager
) {
  try {
    const repository = await findRepository(payload.repository.id);
    if (!repository) return;

    // Process commits
    for (const commit of payload.commits) {
      await webhookService.processCommit({
        repositoryId: repository.id,
        sha: commit.id,
        message: commit.message,
        authorName: commit.author.name,
        authorEmail: commit.author.email,
        commitDate: new Date(commit.timestamp),
        branchName: payload.ref.replace('refs/heads/', ''),
      });
    }

    // Check if this is a merge to main/master branch
    const targetBranch = payload.ref.replace('refs/heads/', '');
    if (['main', 'master', 'development', 'dev'].includes(targetBranch)) {
      // Trigger version calculation for merged issues
      await versionManager.handleBranchMerge(repository.id, targetBranch, payload.commits);
    }
  } catch (error) {
    console.error('Error handling push event:', error);
  }
}

// Handle pull request events
async function handlePullRequestEvent(
  payload: any,
  webhookService: GitHubWebhookService,
  versionManager: VersionManager
) {
  try {
    const repository = await findRepository(payload.repository.id);
    if (!repository) return;

    const action = payload.action;
    const pr = payload.pull_request;

    switch (action) {
      case 'opened':
        // Create PR record and trigger AI review
        const pullRequest = await webhookService.createPullRequest({
          repositoryId: repository.id,
          githubPrId: pr.number,
          title: pr.title,
          description: pr.body,
          state: pr.draft ? 'DRAFT' : 'OPEN',
          baseBranch: pr.base.ref,
          headBranch: pr.head.ref,
          createdById: (await findUserByGithubId(pr.user.id)) || undefined,
          githubCreatedAt: new Date(pr.created_at),
          githubUpdatedAt: new Date(pr.updated_at),
        });

        // PR created successfully
        break;

      case 'closed':
        if (pr.merged) {
          // Handle PR merge - trigger version management
          await versionManager.handlePullRequestMerge(repository.id, pr.number, {
            baseBranch: pr.base.ref,
            headBranch: pr.head.ref,
            mergedAt: new Date(pr.merged_at),
            mergedBy: (await findUserByGithubId(pr.merged_by?.id)) || undefined,
          });
        }

        await webhookService.updatePullRequest(repository.id, pr.number, {
          state: pr.merged ? 'MERGED' : 'CLOSED',
          mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
          closedAt: new Date(),
          mergedById: pr.merged_by ? await findUserByGithubId(pr.merged_by.id) : null,
        });
        break;

      case 'ready_for_review':
        // Trigger AI review when PR moves from draft to ready
        const existingPR = await prisma.pullRequest.findFirst({
          where: {
            repositoryId: repository.id,
            githubPrId: pr.number,
          },
        });

        if (existingPR) {
          await prisma.pullRequest.update({
            where: { id: existingPR.id },
            data: { state: 'OPEN' },
          });

          // PR is now ready for review
        }
        break;

      case 'synchronize':
        // PR updated with new commits
        const prForUpdate = await prisma.pullRequest.findFirst({
          where: {
            repositoryId: repository.id,
            githubPrId: pr.number,
          },
        });

        if (prForUpdate) {
          // PR has been updated with new commits
        }
        break;
    }
  } catch (error) {
    console.error('Error handling pull request event:', error);
  }
}


// Handle check run/suite events (CI/CD status)
async function handleCheckEvent(payload: any, webhookService: GitHubWebhookService) {
  try {
    const repository = await findRepository(payload.repository.id);
    if (!repository) return;

    let pullRequestNumber: number | null = null;

    // Find associated PR
    if (payload.check_run?.pull_requests?.length > 0) {
      pullRequestNumber = payload.check_run.pull_requests[0].number;
    } else if (payload.check_suite?.pull_requests?.length > 0) {
      pullRequestNumber = payload.check_suite.pull_requests[0].number;
    }

    if (pullRequestNumber) {
      const pr = await prisma.pullRequest.findFirst({
        where: {
          repositoryId: repository.id,
          githubPrId: pullRequestNumber,
        },
      });

      if (pr) {
        const checkData = payload.check_run || payload.check_suite;
        const checkName = checkData.name || checkData.app?.name || 'Unknown Check';
        await webhookService.updatePRCheck({
          pullRequestId: pr.id,
          name: checkName,
          status: mapCheckStatus(checkData.status),
          conclusion: checkData.conclusion,
          detailsUrl: checkData.html_url,
          githubCheckId: checkData.id.toString(),
          startedAt: checkData.started_at ? new Date(checkData.started_at) : undefined,
          completedAt: checkData.completed_at ? new Date(checkData.completed_at) : undefined,
        });
      }
    }
  } catch (error) {
    console.error('Error handling check event:', error);
  }
}

// Handle release events
async function handleReleaseEvent(
  payload: any,
  webhookService: GitHubWebhookService,
  versionManager: VersionManager
) {
  try {
    const repository = await findRepository(payload.repository.id);
    if (!repository) return;

    const release = payload.release;
    const action = payload.action;

    if (action === 'published') {
      await versionManager.handleGitHubRelease(repository.id, {
        githubReleaseId: release.id.toString(),
        tagName: release.tag_name,
        name: release.name,
        description: release.body,
        isDraft: release.draft,
        isPrerelease: release.prerelease,
        publishedAt: new Date(release.published_at),
        githubUrl: release.html_url,
      });
    }
  } catch (error) {
    console.error('Error handling release event:', error);
  }
}

// Handle branch creation/deletion
async function handleBranchEvent(
  payload: any,
  webhookService: GitHubWebhookService,
  event: string
) {
  try {
    const repository = await findRepository(payload.repository.id);
    if (!repository) return;

    const branchName = payload.ref;

    if (event === 'create') {
      const headSha = payload.sha || payload.after || 'unknown';
      await webhookService.createBranch({
        repositoryId: repository.id,
        name: branchName,
        headSha,
        issueId: (await extractIssueFromBranchName(repository.projectId, branchName)) || undefined,
      });
    } else if (event === 'delete') {
      await webhookService.deleteBranch(repository.id, branchName);
    }
  } catch (error) {
    console.error('Error handling branch event:', error);
  }
}

// Helper functions
async function verifyWebhookSignature(
  signature: string,
  body: string,
  githubRepoId: string
): Promise<boolean> {
  try {
    const repository = await prisma.repository.findFirst({
      where: { githubRepoId: githubRepoId.toString() },
      select: { webhookSecret: true },
    });

    if (!repository?.webhookSecret) {
      return false;
    }

    const expectedSignature = `sha256=${crypto
      .createHmac('sha256', repository.webhookSecret)
      .update(body)
      .digest('hex')}`;

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
}

async function findRepository(githubRepoId: number) {
  return prisma.repository.findFirst({
    where: { githubRepoId: githubRepoId.toString() },
    include: { project: true },
  });
}

async function findUserByGithubId(githubUserId: number): Promise<string | null> {
  // This would need to be implemented based on how you store GitHub user mappings
  // For now, return null and handle gracefully
  return null;
}

async function extractIssueFromBranchName(
  projectId: string,
  branchName: string
): Promise<string | null> {
  // Extract issue key from branch name (e.g., "feature/MA-123-add-login" -> "MA-123")
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { issuePrefix: true },
  });

  if (!project) return null;

  const regex = new RegExp(`${project.issuePrefix}-(\\d+)`, 'i');
  const match = branchName.match(regex);

  if (match) {
    const issueKey = `${project.issuePrefix}-${match[1]}`;
    const issue = await prisma.issue.findFirst({
      where: { issueKey, projectId },
      select: { id: true },
    });
    return issue?.id || null;
  }

  return null;
}

function mapCheckStatus(githubStatus: string): any {
  const statusMap: Record<string, any> = {
    'queued': 'PENDING',
    'in_progress': 'PENDING',
    'completed': 'SUCCESS',
    'waiting': 'PENDING',
    'requested': 'PENDING',
    'pending': 'PENDING',
  };

  return statusMap[githubStatus] || 'PENDING';
}

