import { prisma } from '@/lib/prisma';
import { AIContentGenerator } from '@/lib/ai/content-generator';
import { AIPRReviewSeverity, AIPRReviewStatus, AIPRReviewTrigger } from '@prisma/client';

interface PRFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

interface PRContext {
  title: string;
  description: string | null;
  baseBranch: string;
  headBranch: string;
}

interface AIReviewFindings {
  security: Array<{ severity: string; message: string; file?: string; line?: number }>;
  bugs: Array<{ severity: string; message: string; file?: string; line?: number }>;
  performance: Array<{ severity: string; message: string; file?: string; line?: number }>;
  codeQuality: Array<{ severity: string; message: string; file?: string; line?: number }>;
  suggestions: Array<{ message: string; file?: string }>;
}

interface AIReviewAnalysis {
  summary: string;
  findings: AIReviewFindings;
  overallSeverity: AIPRReviewSeverity;
  totalIssues: number;
}

export class AIPRReviewService {
  private aiGenerator: AIContentGenerator;

  constructor() {
    this.aiGenerator = new AIContentGenerator();
  }

  /**
   * Fetch PR diff from GitHub API
   */
  async fetchPRDiff(
    accessToken: string,
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<string> {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3.diff',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch PR diff: ${response.statusText}`);
    }

    return response.text();
  }

  /**
   * Fetch PR files from GitHub API
   */
  async fetchPRFiles(
    accessToken: string,
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<PRFile[]> {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch PR files: ${response.statusText}`);
    }

    const files = await response.json();
    return files.map((file: PRFile) => ({
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      patch: file.patch,
    }));
  }

  /**
   * Analyze code with AI
   */
  async analyzeCode(
    diff: string,
    files: PRFile[],
    prContext: PRContext
  ): Promise<AIReviewAnalysis> {
    // Limit diff size to avoid token limits
    const truncatedDiff = diff.length > 15000 ? diff.slice(0, 15000) + '\n...[truncated]' : diff;

    const changedFiles = files.map(f => `${f.filename} (+${f.additions}/-${f.deletions})`);

    const result = await this.aiGenerator.generatePRReview(
      truncatedDiff,
      prContext.title,
      prContext.description || '',
      changedFiles
    );

    return result;
  }

  /**
   * Format review for GitHub markdown
   */
  formatGitHubReview(analysis: AIReviewAnalysis, prTitle: string): string {
    const { findings, summary, totalIssues } = analysis;

    let review = `## 🤖 AI Code Review\n\n`;
    review += `### Summary\n${summary}\n\n`;

    // Security issues
    if (findings.security.length > 0) {
      review += `### 🔒 Security (${findings.security.length} ${findings.security.length === 1 ? 'issue' : 'issues'})\n`;
      findings.security.forEach(issue => {
        const location = issue.file ? ` \`${issue.file}${issue.line ? `:${issue.line}` : ''}\`` : '';
        review += `- **${issue.severity}**:${location} ${issue.message}\n`;
      });
      review += '\n';
    }

    // Potential bugs
    if (findings.bugs.length > 0) {
      review += `### 🐛 Potential Bugs (${findings.bugs.length} ${findings.bugs.length === 1 ? 'issue' : 'issues'})\n`;
      findings.bugs.forEach(issue => {
        const location = issue.file ? ` \`${issue.file}${issue.line ? `:${issue.line}` : ''}\`` : '';
        review += `- **${issue.severity}**:${location} ${issue.message}\n`;
      });
      review += '\n';
    }

    // Performance
    if (findings.performance.length > 0) {
      review += `### ⚡ Performance (${findings.performance.length} ${findings.performance.length === 1 ? 'suggestion' : 'suggestions'})\n`;
      findings.performance.forEach(issue => {
        const location = issue.file ? ` \`${issue.file}${issue.line ? `:${issue.line}` : ''}\`` : '';
        review += `- ${location} ${issue.message}\n`;
      });
      review += '\n';
    }

    // Code quality
    if (findings.codeQuality.length > 0) {
      review += `### 📝 Code Quality (${findings.codeQuality.length} ${findings.codeQuality.length === 1 ? 'item' : 'items'})\n`;
      findings.codeQuality.forEach(issue => {
        const location = issue.file ? ` \`${issue.file}${issue.line ? `:${issue.line}` : ''}\`` : '';
        review += `- ${location} ${issue.message}\n`;
      });
      review += '\n';
    }

    // Suggestions
    if (findings.suggestions.length > 0) {
      review += `### ✨ Suggestions\n`;
      findings.suggestions.forEach(suggestion => {
        const location = suggestion.file ? ` \`${suggestion.file}\`` : '';
        review += `- ${location} ${suggestion.message}\n`;
      });
      review += '\n';
    }

    // Footer
    if (totalIssues === 0) {
      review += `---\n✅ *No significant issues found. This PR looks good!*\n`;
    } else {
      review += `---\n`;
    }
    review += `*🤖 Review generated by AI*`;

    return review;
  }

  /**
   * Post review comment to GitHub
   */
  async postReviewToGitHub(
    accessToken: string,
    owner: string,
    repo: string,
    prNumber: number,
    reviewBody: string
  ): Promise<string> {
    // Post as issue comment (PR comments use issues endpoint)
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ body: reviewBody }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to post review to GitHub: ${response.statusText} - ${error}`);
    }

    const comment = await response.json();
    return comment.id.toString();
  }

  /**
   * Main orchestration method for performing a review
   */
  async performReview(
    pullRequestId: string,
    triggerType: AIPRReviewTrigger,
    triggeredById?: string
  ): Promise<{ success: boolean; reviewId?: string; error?: string }> {
    // Get pull request with repository details
    const pullRequest = await prisma.pullRequest.findUnique({
      where: { id: pullRequestId },
      include: {
        repository: true,
      },
    });

    if (!pullRequest || !pullRequest.repository) {
      return { success: false, error: 'Pull request or repository not found' };
    }

    const { repository } = pullRequest;

    if (!repository.accessToken) {
      return { success: false, error: 'Repository access token not available' };
    }

    // Create AI review record
    const aiReview = await prisma.aIPRReview.create({
      data: {
        pullRequestId,
        repositoryId: repository.id,
        triggerType,
        triggeredById,
        status: AIPRReviewStatus.PENDING,
        summary: '',
        findings: {},
        fullReview: '',
      },
    });

    try {
      // Update status to analyzing
      await prisma.aIPRReview.update({
        where: { id: aiReview.id },
        data: { status: AIPRReviewStatus.ANALYZING },
      });

      // Fetch PR diff and files
      const [diff, files] = await Promise.all([
        this.fetchPRDiff(
          repository.accessToken,
          repository.owner,
          repository.name,
          pullRequest.githubPrId
        ),
        this.fetchPRFiles(
          repository.accessToken,
          repository.owner,
          repository.name,
          pullRequest.githubPrId
        ),
      ]);

      // Analyze code
      const analysis = await this.analyzeCode(diff, files, {
        title: pullRequest.title,
        description: pullRequest.description,
        baseBranch: pullRequest.baseBranchName || 'main',
        headBranch: pullRequest.headBranchName || 'feature',
      });

      // Format review for GitHub
      const fullReview = this.formatGitHubReview(analysis, pullRequest.title);

      // Calculate metrics
      const filesAnalyzed = files.length;
      const linesAnalyzed = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);

      // Post to GitHub
      let githubCommentId: string | undefined;
      try {
        githubCommentId = await this.postReviewToGitHub(
          repository.accessToken,
          repository.owner,
          repository.name,
          pullRequest.githubPrId,
          fullReview
        );
      } catch (postError) {
        console.error('Failed to post review to GitHub:', postError);
        // Continue even if posting fails - we still have the review in our system
      }

      // Update review with results
      await prisma.aIPRReview.update({
        where: { id: aiReview.id },
        data: {
          status: AIPRReviewStatus.COMPLETED,
          summary: analysis.summary,
          findings: analysis.findings as object,
          fullReview,
          filesAnalyzed,
          linesAnalyzed,
          issuesFound: analysis.totalIssues,
          severity: analysis.overallSeverity,
          githubCommentId,
          postedToGitHub: !!githubCommentId,
          postedAt: githubCommentId ? new Date() : null,
        },
      });

      return { success: true, reviewId: aiReview.id };
    } catch (error) {
      console.error('Error performing AI review:', error);

      // Update review with error
      await prisma.aIPRReview.update({
        where: { id: aiReview.id },
        data: {
          status: AIPRReviewStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : 'Unknown error occurred',
        },
      });

      return {
        success: false,
        reviewId: aiReview.id,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Check if AI review should be auto-triggered for a repository
   */
  async shouldAutoTrigger(repositoryId: string): Promise<boolean> {
    const repository = await prisma.repository.findUnique({
      where: { id: repositoryId },
      select: {
        aiReviewEnabled: true,
        aiReviewAutoTrigger: true,
      },
    });

    return !!(repository?.aiReviewEnabled && repository?.aiReviewAutoTrigger);
  }
}

// Export singleton instance
export const aiPRReviewService = new AIPRReviewService();
