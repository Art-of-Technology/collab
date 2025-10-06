import { prisma } from "@/lib/prisma";
import { PrismaClient, IssueType } from "@prisma/client";
import semver from "semver";

interface CommitInfo {
  id: string;
  message: string;
  authorName: string;
  sha: string;
}

interface MergeInfo {
  baseBranch: string;
  headBranch: string;
  mergedAt: Date;
  mergedBy?: string;
}

interface GitHubReleaseData {
  githubReleaseId: string;
  tagName: string;
  name: string;
  description?: string;
  isDraft: boolean;
  isPrerelease: boolean;
  publishedAt: Date;
  githubUrl: string;
}

interface VersionCalculation {
  version: string;
  major: number;
  minor: number;
  patch: number;
  releaseType: 'MAJOR' | 'MINOR' | 'PATCH' | 'PRERELEASE';
  issues: string[]; // Issue IDs
  environment: string;
}

export class VersionManager {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  /**
   * Handle branch merge and calculate next version
   */
  async handleBranchMerge(repositoryId: string, targetBranch: string, commits: CommitInfo[]) {
    try {
      const environment = this.getEnvironmentFromBranch(targetBranch);
      
      // Extract issues from commits
      const issueIds = await this.extractIssuesFromCommits(repositoryId, commits);
      
      if (issueIds.length === 0) {
        console.log('No tracked issues found in commits, skipping version calculation');
        return null;
      }

      // Get issue details for version calculation
      const issues = await this.prisma.issue.findMany({
        where: { id: { in: issueIds } },
        select: { id: true, type: true, issueKey: true, title: true, description: true },
      });

      // Special handling for production merges (dev -> master)
      if (environment === 'production') {
        return await this.handleProductionMerge(repositoryId, issues.map(issue => ({
          ...issue,
          description: issue.description || undefined
        })));
      }

      // Calculate next version for development/staging
      const versionCalc = await this.calculateNextVersion(repositoryId, issues, environment);
      
      // Create version record
      const version = await this.createVersion(repositoryId, versionCalc, issues.map(issue => ({
        ...issue,
        description: issue.description || undefined
      })));
      
      // Generate AI-enhanced changelog
      await this.generateVersionChangelog(version.id, issues);
      
      // Update version.json if needed
      await this.updateVersionFile(repositoryId, version, environment);
      
      return version;
    } catch (error) {
      console.error('Error handling branch merge:', error);
      throw error;
    }
  }

  /**
   * Handle production merge (dev -> master)
   * Promotes existing development version to production
   */
  private async handleProductionMerge(repositoryId: string, issues: Array<{ id: string; type: IssueType; issueKey: string | null; title: string; description?: string }>) {
    try {
      // Find the latest development version that contains these issues
      const developmentVersion = await this.prisma.version.findFirst({
        where: {
          repositoryId,
          environment: 'development',
          status: { notIn: ['FAILED', 'CANCELLED'] },
          issues: {
            some: {
              issueId: { in: issues.map(i => i.id) }
            }
          }
        },
        orderBy: [
          { major: 'desc' },
          { minor: 'desc' },
          { patch: 'desc' },
          { createdAt: 'desc' }
        ],
        include: {
          issues: {
            include: {
              issue: true
            }
          }
        }
      });

      if (developmentVersion) {
        // Promote existing development version to production
        const productionVersion = await this.prisma.version.upsert({
          where: {
            repositoryId_version: {
              repositoryId,
              version: developmentVersion.version,
            },
          },
          update: {
            environment: 'production',
            status: 'READY',
            updatedAt: new Date(),
          },
          create: {
            repositoryId,
            version: developmentVersion.version,
            major: developmentVersion.major,
            minor: developmentVersion.minor,
            patch: developmentVersion.patch,
            releaseType: developmentVersion.releaseType,
            status: 'READY',
            environment: 'production',
          },
        });

        // Link all issues from development version to production version
        for (const versionIssue of developmentVersion.issues) {
          await this.prisma.versionIssue.upsert({
            where: {
              versionId_issueId: {
                versionId: productionVersion.id,
                issueId: versionIssue.issueId,
              },
            },
            update: {},
            create: {
              versionId: productionVersion.id,
              issueId: versionIssue.issueId,
            },
          });
        }

        // Update version.json for production
        await this.updateVersionFile(repositoryId, productionVersion, 'production');

        return productionVersion;
      } else {
        // Fallback: create new production version if no development version found
        const versionCalc = await this.calculateNextVersion(repositoryId, issues, 'production');
        return await this.createVersion(repositoryId, versionCalc, issues);
      }
    } catch (error) {
      console.error('Error handling production merge:', error);
      throw error;
    }
  }

  /**
   * Handle pull request merge
   */
  async handlePullRequestMerge(repositoryId: string, prNumber: number, mergeInfo: MergeInfo) {
    try {
      // Find the pull request
      const pullRequest = await this.prisma.pullRequest.findFirst({
        where: {
          repositoryId,
          githubPrId: prNumber,
        },
        include: {
          issue: true,
          commits: true,
        },
      });

      if (!pullRequest) {
        console.log(`Pull request ${prNumber} not found`);
        return null;
      }

      // Get environment from target branch
      const environment = this.getEnvironmentFromBranch(mergeInfo.baseBranch);
      
      // Only calculate versions for main deployment branches
      if (['development', 'staging', 'production'].includes(environment)) {
        const issues = pullRequest.issue ? [pullRequest.issue] : [];
        
        if (issues.length > 0) {
          const versionCalc = await this.calculateNextVersion(repositoryId, issues, environment);
          const version = await this.createVersion(repositoryId, versionCalc, issues.map(issue => ({
            ...issue,
            description: issue.description || undefined
          })));
          
          // Generate changelog entry
          await this.generateVersionChangelog(version.id, issues);
          
          return version;
        }
      }

      return null;
    } catch (error) {
      console.error('Error handling pull request merge:', error);
      throw error;
    }
  }

  /**
   * Handle GitHub release creation
   */
  async handleGitHubRelease(repositoryId: string, releaseData: GitHubReleaseData) {
    try {
      // Parse version from tag name
      const versionString = releaseData.tagName.replace(/^v/, ''); // Remove 'v' prefix if present
      const parsedVersion = semver.parse(versionString);
      
      if (!parsedVersion) {
        console.error(`Invalid version format: ${versionString}`);
        return null;
      }

      // Find or create version record
      let version = await this.prisma.version.findFirst({
        where: {
          repositoryId,
          version: versionString,
        },
      });

      if (!version) {
        // Create version from release
        version = await this.prisma.version.create({
          data: {
            repositoryId,
            version: versionString,
            major: parsedVersion.major,
            minor: parsedVersion.minor,
            patch: parsedVersion.patch,
            prerelease: parsedVersion.prerelease.join('.') || null,
            releaseType: this.determineReleaseType(parsedVersion),
            status: 'RELEASED',
            environment: releaseData.isPrerelease ? 'staging' : 'production',
            releasedAt: releaseData.publishedAt,
          },
        });
      }

      // Create or update release record
      const release = await this.prisma.release.upsert({
        where: {
          repositoryId_tagName: {
            repositoryId,
            tagName: releaseData.tagName,
          },
        },
        update: {
          name: releaseData.name,
          description: releaseData.description,
          isDraft: releaseData.isDraft,
          isPrerelease: releaseData.isPrerelease,
          publishedAt: releaseData.publishedAt,
          githubUrl: releaseData.githubUrl,
        },
        create: {
          repositoryId,
          versionId: version.id,
          githubReleaseId: releaseData.githubReleaseId,
          tagName: releaseData.tagName,
          name: releaseData.name,
          description: releaseData.description,
          isDraft: releaseData.isDraft,
          isPrerelease: releaseData.isPrerelease,
          publishedAt: releaseData.publishedAt,
          githubUrl: releaseData.githubUrl,
        },
      });

      return { version, release };
    } catch (error) {
      console.error('Error handling GitHub release:', error);
      throw error;
    }
  }

  /**
   * Calculate next version based on issues and SemVer rules
   */
  private async calculateNextVersion(
    repositoryId: string,
    issues: Array<{ id: string; type: IssueType; issueKey: string | null }>,
    environment: string
  ): Promise<VersionCalculation> {
    try {
      // Get current version
      const currentVersion = await this.getCurrentVersion(repositoryId, environment);
      
      // Determine version bump based on issue types
      const releaseType = this.determineVersionBump(issues);
      
      // Calculate next semantic version
      const nextVersion = this.calculateSemVer(currentVersion, releaseType);
      
      return {
        version: nextVersion.version,
        major: nextVersion.major,
        minor: nextVersion.minor,
        patch: nextVersion.patch,
        releaseType,
        issues: issues.map(i => i.id),
        environment,
      };
    } catch (error) {
      console.error('Error calculating next version:', error);
      throw error;
    }
  }

  /**
   * Create version record in database
   */
  private async createVersion(
    repositoryId: string,
    versionCalc: VersionCalculation,
    issues: Array<{ id: string; type: IssueType; issueKey: string | null; title: string; description?: string }>
  ) {
    try {
      // Use upsert to handle duplicate version numbers
      const version = await this.prisma.version.upsert({
        where: {
          repositoryId_version: {
            repositoryId,
            version: versionCalc.version,
          },
        },
        update: {
          // Update status if version already exists
          status: 'PENDING',
          updatedAt: new Date(),
        },
        create: {
          repositoryId,
          version: versionCalc.version,
          major: versionCalc.major,
          minor: versionCalc.minor,
          patch: versionCalc.patch,
          releaseType: versionCalc.releaseType,
          status: 'PENDING',
          environment: versionCalc.environment,
        },
      });

      // Link issues to version (only if not already linked)
      for (const issue of issues) {
        await this.prisma.versionIssue.upsert({
          where: {
            versionId_issueId: {
              versionId: version.id,
              issueId: issue.id,
            },
          },
          update: {
            // Issue already linked, no update needed
          },
          create: {
            versionId: version.id,
            issueId: issue.id,
          },
        });
      }

      return version;
    } catch (error) {
      console.error('Error creating version:', error);
      throw error;
    }
  }

  /**
   * Generate AI-enhanced changelog for version
   */
  private async generateVersionChangelog(versionId: string, issues: any[]) {
    try {
      const { AIContentGenerator } = await import('@/lib/ai/content-generator');
      const aiGenerator = new AIContentGenerator();

      // Generate AI summaries for each issue
      for (const issue of issues) {
        const aiTitle = await aiGenerator.enhanceIssueTitle(issue.title, issue.description);
        const aiSummary = await aiGenerator.generateIssueSummary(issue.title, issue.description, issue.type);

        await this.prisma.versionIssue.updateMany({
          where: {
            versionId,
            issueId: issue.id,
          },
          data: {
            aiTitle,
            aiSummary,
          },
        });
      }

      // Generate overall version changelog
      const versionChangelog = await aiGenerator.generateVersionChangelog(issues);
      const versionSummary = await aiGenerator.generateVersionSummary(issues);

      await this.prisma.version.update({
        where: { id: versionId },
        data: {
          aiChangelog: versionChangelog,
          aiSummary: versionSummary,
        },
      });
    } catch (error) {
      console.error('Error generating version changelog:', error);
      // Don't throw - this is not critical for version creation
    }
  }

  /**
   * Update version.json file for deployment
   */
  private async updateVersionFile(repositoryId: string, version: any, environment: string) {
    try {
      const versionFileContent = {
        version: version.version,
        buildTime: new Date().toISOString(),
        environment,
        features: [] as string[], // Will be populated with feature issue keys
        bugfixes: [] as string[], // Will be populated with bug issue keys
        commit: '', // Will be populated with latest commit
      };

      // Get issues for this version
      const versionIssues = await this.prisma.versionIssue.findMany({
        where: { versionId: version.id },
        include: { issue: true },
      });

      // Categorize issues
      versionFileContent.features = versionIssues
        .filter(vi => ['TASK', 'STORY', 'EPIC'].includes(vi.issue.type))
        .map(vi => vi.issue.issueKey)
        .filter((key): key is string => Boolean(key));

      versionFileContent.bugfixes = versionIssues
        .filter(vi => vi.issue.type === 'BUG')
        .map(vi => vi.issue.issueKey)
        .filter((key): key is string => Boolean(key));

      // Get latest commit
      const latestCommit = await this.prisma.commit.findFirst({
        where: { repositoryId },
        orderBy: { commitDate: 'desc' },
        select: { sha: true },
      });

      if (latestCommit) {
        versionFileContent.commit = latestCommit.sha;
      }

      // Create or update version file record
      await this.prisma.versionFile.upsert({
        where: {
          repositoryId_environment: {
            repositoryId,
            environment,
          },
        },
        update: {
          versionId: version.id,
          content: versionFileContent,
          deployedAt: new Date(),
        },
        create: {
          repositoryId,
          versionId: version.id,
          environment,
          content: versionFileContent,
          deployedAt: new Date(),
        },
      });
    } catch (error) {
      console.error('Error updating version file:', error);
      // Don't throw - this is not critical
    }
  }

  // Helper methods
  private getEnvironmentFromBranch(branchName: string): string {
    const envMap: Record<string, string> = {
      'main': 'production',
      'master': 'production',
      'production': 'production',
      'develop': 'development',
      'development': 'development',
      'dev': 'development',
      'staging': 'staging',
      'uat': 'staging',
    };

    return envMap[branchName] || 'development';
  }

  private determineVersionBump(issues: Array<{ type: IssueType }>): 'MAJOR' | 'MINOR' | 'PATCH' {
    // Check for breaking changes (would need to be manually flagged or determined by issue labels)
    const hasBreakingChanges = false; // This would need custom logic

    if (hasBreakingChanges) {
      return 'MAJOR';
    }

    // Check for new features
    const hasFeatures = issues.some(issue => 
      ['TASK', 'STORY', 'EPIC'].includes(issue.type)
    );

    if (hasFeatures) {
      return 'MINOR';
    }

    // Only bug fixes
    return 'PATCH';
  }

  private calculateSemVer(
    currentVersion: string,
    releaseType: 'MAJOR' | 'MINOR' | 'PATCH'
  ): { version: string; major: number; minor: number; patch: number } {
    const nextVersion = semver.inc(currentVersion, releaseType.toLowerCase() as semver.ReleaseType);
    
    if (!nextVersion) {
      throw new Error(`Failed to calculate next version from ${currentVersion}`);
    }

    const parsed = semver.parse(nextVersion);
    if (!parsed) {
      throw new Error(`Failed to parse calculated version: ${nextVersion}`);
    }

    return {
      version: nextVersion,
      major: parsed.major,
      minor: parsed.minor,
      patch: parsed.patch,
    };
  }

  private async getCurrentVersion(repositoryId: string, environment: string): Promise<string> {
    const latestVersion = await this.prisma.version.findFirst({
      where: {
        repositoryId,
        environment,
        // Include all statuses except FAILED and CANCELLED to get the latest version
        status: { notIn: ['FAILED', 'CANCELLED'] },
      },
      orderBy: [
        { major: 'desc' },
        { minor: 'desc' },
        { patch: 'desc' },
        { createdAt: 'desc' }, // Add createdAt as tiebreaker
      ],
    });

    return latestVersion?.version || '0.0.0';
  }

  private determineReleaseType(version: semver.SemVer): 'MAJOR' | 'MINOR' | 'PATCH' | 'PRERELEASE' {
    if (version.prerelease.length > 0) {
      return 'PRERELEASE';
    }
    
    // This is simplified - in practice you'd compare with previous version
    return 'MINOR';
  }

  private async extractIssuesFromCommits(repositoryId: string, commits: CommitInfo[]): Promise<string[]> {
    const issueIds: string[] = [];

    for (const commit of commits) {
      const issueId = await this.extractIssueFromMessage(repositoryId, commit.message);
      if (issueId) {
        issueIds.push(issueId);
      }
    }

    return [...new Set(issueIds)]; // Remove duplicates
  }

  private async extractIssueFromMessage(repositoryId: string, message: string): Promise<string | null> {
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
      console.error('Error extracting issue from message:', error);
      return null;
    }
  }
}
