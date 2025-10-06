import { prisma } from "@/lib/prisma";
import { PrismaClient } from "@prisma/client";

interface CommitData {
  repositoryId: string;
  sha: string;
  message: string;
  authorName: string;
  authorEmail: string;
  commitDate: Date;
  branchName: string;
}

interface PullRequestData {
  repositoryId: string;
  githubPrId: number;
  title: string;
  description?: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED' | 'DRAFT';
  baseBranch: string;
  headBranch: string;
  createdById?: string;
  githubCreatedAt: Date;
  githubUpdatedAt: Date;
}

interface BranchData {
  repositoryId: string;
  name: string;
  headSha: string;
  issueId?: string;
}

interface PRCheckData {
  pullRequestId: string;
  name: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILURE' | 'ERROR' | 'CANCELLED' | 'NEUTRAL' | 'SKIPPED';
  conclusion?: string;
  detailsUrl?: string;
  githubCheckId?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export class GitHubWebhookService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  async processCommit(commitData: CommitData) {
    try {
      // Find or create branch
      const branch = await this.findOrCreateBranch(
        commitData.repositoryId,
        commitData.branchName,
        commitData.sha
      );

      // Extract issue from commit message
      const issueId = await this.extractIssueFromCommitMessage(
        commitData.repositoryId,
        commitData.message
      );

      // Create or update commit
      const commit = await this.prisma.commit.upsert({
        where: { sha: commitData.sha },
        update: {
          message: commitData.message,
          branchId: branch.id,
          issueId,
        },
        create: {
          repositoryId: commitData.repositoryId,
          sha: commitData.sha,
          message: commitData.message,
          authorName: commitData.authorName,
          authorEmail: commitData.authorEmail,
          commitDate: commitData.commitDate,
          branchId: branch.id,
          issueId,
        },
      });

      // Link commit to pull request if exists
      await this.linkCommitToPullRequest(commit.id, branch.id);

      return commit;
    } catch (error) {
      console.error('Error processing commit:', error);
      throw error;
    }
  }

  async createPullRequest(prData: PullRequestData) {
    try {
      // Find branches
      const baseBranch = await this.findOrCreateBranch(
        prData.repositoryId,
        prData.baseBranch,
        ''
      );
      const headBranch = await this.findOrCreateBranch(
        prData.repositoryId,
        prData.headBranch,
        ''
      );

      // Extract issue from branch name or PR title
      const issueId = await this.extractIssueFromBranchName(
        prData.repositoryId,
        prData.headBranch
      ) || await this.extractIssueFromCommitMessage(
        prData.repositoryId,
        prData.title
      );

      const pullRequest = await this.prisma.pullRequest.create({
        data: {
          repositoryId: prData.repositoryId,
          githubPrId: prData.githubPrId,
          title: prData.title,
          description: prData.description,
          state: prData.state,
          baseBranchId: baseBranch.id,
          headBranchId: headBranch.id,
          issueId,
          createdById: prData.createdById,
          githubCreatedAt: prData.githubCreatedAt,
          githubUpdatedAt: prData.githubUpdatedAt,
        },
        include: {
          issue: true,
          repository: {
            include: { project: true },
          },
        },
      });

      return pullRequest;
    } catch (error) {
      console.error('Error creating pull request:', error);
      throw error;
    }
  }

  async updatePullRequest(
    repositoryId: string,
    githubPrId: number,
    updates: Partial<{
      state: 'OPEN' | 'CLOSED' | 'MERGED' | 'DRAFT';
      mergedAt: Date | null;
      closedAt: Date;
      mergedById: string | null;
    }>
  ) {
    try {
      return await this.prisma.pullRequest.updateMany({
        where: {
          repositoryId,
          githubPrId,
        },
        data: updates,
      });
    } catch (error) {
      console.error('Error updating pull request:', error);
      throw error;
    }
  }

  async updatePRCheck(checkData: PRCheckData) {
    try {
      return await this.prisma.pRCheck.upsert({
        where: {
          pullRequestId_name: {
            pullRequestId: checkData.pullRequestId,
            name: checkData.name,
          },
        },
        update: {
          status: checkData.status,
          conclusion: checkData.conclusion,
          detailsUrl: checkData.detailsUrl,
          githubCheckId: checkData.githubCheckId,
          startedAt: checkData.startedAt,
          completedAt: checkData.completedAt,
        },
        create: {
          pullRequestId: checkData.pullRequestId,
          name: checkData.name,
          status: checkData.status,
          conclusion: checkData.conclusion,
          detailsUrl: checkData.detailsUrl,
          githubCheckId: checkData.githubCheckId,
          startedAt: checkData.startedAt,
          completedAt: checkData.completedAt,
        },
      });
    } catch (error) {
      console.error('Error updating PR check:', error);
      throw error;
    }
  }

  async createBranch(branchData: BranchData) {
    try {
      return await this.prisma.branch.create({
        data: {
          repositoryId: branchData.repositoryId,
          name: branchData.name,
          headSha: branchData.headSha,
          issueId: branchData.issueId,
          isDefault: ['main', 'master'].includes(branchData.name),
        },
      });
    } catch (error) {
      console.error('Error creating branch:', error);
      throw error;
    }
  }

  async deleteBranch(repositoryId: string, branchName: string) {
    try {
      return await this.prisma.branch.deleteMany({
        where: {
          repositoryId,
          name: branchName,
        },
      });
    } catch (error) {
      console.error('Error deleting branch:', error);
      throw error;
    }
  }

  // Private helper methods
  private async findOrCreateBranch(repositoryId: string, branchName: string, headSha: string) {
    let branch = await this.prisma.branch.findFirst({
      where: {
        repositoryId,
        name: branchName,
      },
    });

    if (!branch) {
      const issueId = await this.extractIssueFromBranchName(repositoryId, branchName);
      branch = await this.prisma.branch.create({
        data: {
          repositoryId,
          name: branchName,
          headSha: headSha || 'unknown',
          issueId,
          isDefault: ['main', 'master'].includes(branchName),
        },
      });
    } else if (headSha && branch.headSha !== headSha) {
      branch = await this.prisma.branch.update({
        where: { id: branch.id },
        data: { headSha },
      });
    }

    return branch;
  }

  private async extractIssueFromCommitMessage(
    repositoryId: string,
    message: string
  ): Promise<string | null> {
    try {
      const repository = await this.prisma.repository.findUnique({
        where: { id: repositoryId },
        include: { project: true },
      });

      if (!repository) return null;

      const issuePrefix = repository.project.issuePrefix;
      const regex = new RegExp(`${issuePrefix}-(\\d+)`, 'gi');
      const matches = message.match(regex);

      if (matches && matches.length > 0) {
        const issueKey = matches[0].toUpperCase();
        const issue = await this.prisma.issue.findFirst({
          where: {
            issueKey,
            projectId: repository.projectId,
          },
          select: { id: true },
        });
        return issue?.id || null;
      }

      return null;
    } catch (error) {
      console.error('Error extracting issue from commit message:', error);
      return null;
    }
  }

  private async extractIssueFromBranchName(
    repositoryId: string,
    branchName: string
  ): Promise<string | null> {
    try {
      const repository = await this.prisma.repository.findUnique({
        where: { id: repositoryId },
        include: { project: true },
      });

      if (!repository) return null;

      const issuePrefix = repository.project.issuePrefix;
      const regex = new RegExp(`${issuePrefix}-(\\d+)`, 'i');
      const match = branchName.match(regex);

      if (match) {
        const issueKey = `${issuePrefix}-${match[1]}`;
        const issue = await this.prisma.issue.findFirst({
          where: {
            issueKey,
            projectId: repository.projectId,
          },
          select: { id: true },
        });
        return issue?.id || null;
      }

      return null;
    } catch (error) {
      console.error('Error extracting issue from branch name:', error);
      return null;
    }
  }

  private async linkCommitToPullRequest(commitId: string, branchId: string) {
    try {
      // Find open PR for this branch
      const pullRequest = await this.prisma.pullRequest.findFirst({
        where: {
          headBranchId: branchId,
          state: { in: ['OPEN', 'DRAFT'] },
        },
        select: { id: true },
      });

      if (pullRequest) {
        await this.prisma.commit.update({
          where: { id: commitId },
          data: { pullRequestId: pullRequest.id },
        });
      }
    } catch (error) {
      console.error('Error linking commit to pull request:', error);
      // Don't throw - this is not critical
    }
  }
}
