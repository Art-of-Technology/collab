import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import OpenAI from 'openai';

// POST /api/github/repositories/[repositoryId]/generate-changelog - Generate AI changelog
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ repositoryId: string }> }
) {
  try {
    const { repositoryId } = await params;

    let body: { releaseId?: string; versionId?: string; options?: Record<string, unknown> } = {};
    try {
      body = await request.json();
    } catch {
      // No body provided, will use defaults
    }

    const { releaseId, versionId, options } = body;

    const {
      includeCommits = true,
      includePRs = true,
      includeReleaseNotes = true,
      format = 'markdown',
    } = options || {};

    // Get repository
    const repository = await prisma.repository.findUnique({
      where: { id: repositoryId },
    });

    if (!repository) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    // Determine what to generate changelog for
    let release = null;
    let version = null;
    let targetVersionId = versionId;

    // If releaseId is provided, get the release
    if (releaseId) {
      release = await prisma.release.findUnique({
        where: { id: releaseId },
        include: {
          version: {
            include: {
              issues: {
                include: {
                  issue: true,
                },
              },
            },
          },
        },
      });
      if (release?.version) {
        targetVersionId = release.version.id;
        version = release.version;
      }
    }

    // If no release specified, get the latest release
    if (!release) {
      release = await prisma.release.findFirst({
        where: { repositoryId },
        orderBy: { publishedAt: 'desc' },
        include: {
          version: {
            include: {
              issues: {
                include: {
                  issue: true,
                },
              },
            },
          },
        },
      });
      if (release?.version) {
        targetVersionId = release.version.id;
        version = release.version;
      }
    }

    // If still no version, get the latest version directly
    if (!version && !targetVersionId) {
      version = await prisma.version.findFirst({
        where: { repositoryId },
        orderBy: { createdAt: 'desc' },
        include: {
          issues: {
            include: {
              issue: true,
            },
          },
        },
      });
      targetVersionId = version?.id;
    } else if (targetVersionId && !version) {
      version = await prisma.version.findUnique({
        where: { id: targetVersionId },
        include: {
          issues: {
            include: {
              issue: true,
            },
          },
        },
      });
    }

    // Collect data for changelog generation
    const changelogData: {
      releaseNotes?: string;
      releaseName?: string;
      tagName?: string;
      versionNumber?: string;
      commits: Array<{ message: string; author: string; sha: string; date?: Date }>;
      pullRequests: Array<{ title: string; body?: string; number: number; author?: string }>;
      issues: Array<{ key: string; title: string; type: string }>;
    } = {
      commits: [],
      pullRequests: [],
      issues: [],
      releaseName: release?.name || version?.version || 'Latest',
      tagName: release?.tagName || (version ? `v${version.version}` : undefined),
      versionNumber: version?.version,
    };

    // Include release notes from GitHub (only if they're substantial)
    if (includeReleaseNotes && release?.description) {
      const description = release.description.trim();
      // Only include if it has meaningful content (not just auto-generated or empty)
      if (description.length > 20 && !isGenericReleaseNotes(description)) {
        changelogData.releaseNotes = description;
      }
    }

    // Include issues linked to this version
    if (version?.issues) {
      changelogData.issues = version.issues.map((vi) => ({
        key: vi.issue.issueKey || '',
        title: vi.issue.title,
        type: vi.issue.type,
      }));
    }

    // Always get commits from database (they're synced)
    if (includeCommits) {
      const commits = await prisma.commit.findMany({
        where: { repositoryId },
        orderBy: { commitDate: 'desc' },
        take: 100,
        select: {
          sha: true,
          message: true,
          authorName: true,
          commitDate: true,
        },
      });

      changelogData.commits = commits.map((c) => ({
        sha: c.sha,
        message: c.message,
        author: c.authorName,
        date: c.commitDate,
      }));
    }

    // Get PRs from database
    if (includePRs) {
      const prs = await prisma.pullRequest.findMany({
        where: {
          repositoryId,
          state: 'MERGED',
        },
        orderBy: { mergedAt: 'desc' },
        take: 30,
        select: {
          title: true,
          description: true,
          githubPrId: true,
          createdBy: {
            select: {
              name: true,
            },
          },
        },
      });

      changelogData.pullRequests = prs.map((pr) => ({
        title: pr.title,
        body: pr.description || undefined,
        number: pr.githubPrId,
        author: pr.createdBy?.name || undefined,
      }));
    }

    // Check if we have enough data to generate a meaningful changelog
    const hasData = changelogData.commits.length > 0 ||
                   changelogData.pullRequests.length > 0 ||
                   changelogData.issues.length > 0 ||
                   changelogData.releaseNotes;

    if (!hasData) {
      return NextResponse.json({
        error: "No data available. Please sync your repository first.",
        needsSync: true
      }, { status: 400 });
    }

    // Categorize commits by type
    const categorizedCommits = categorizeCommits(changelogData.commits);

    // Generate changelog with AI
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = buildEnhancedChangelogPrompt(
      changelogData.tagName || changelogData.versionNumber || 'Latest',
      changelogData.releaseName || 'Release',
      {
        releaseNotes: changelogData.releaseNotes,
        categorizedCommits,
        pullRequests: changelogData.pullRequests,
        issues: changelogData.issues,
      },
      format
    );

    console.log('[GENERATE_CHANGELOG] Generating with prompt length:', prompt.length);
    console.log('[GENERATE_CHANGELOG] Data summary:', {
      commits: changelogData.commits.length,
      prs: changelogData.pullRequests.length,
      issues: changelogData.issues.length,
      hasReleaseNotes: !!changelogData.releaseNotes,
    });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are an expert technical writer who creates professional, well-structured software release changelogs.
Your changelogs should:
- Be well-organized with clear sections
- Highlight the most important changes first
- Use clear, user-friendly language that non-technical users can understand
- Include emojis for visual appeal and quick scanning
- Group related changes together intelligently
- Focus on user benefits and impacts, not implementation details
- Extract meaningful information from commit messages, even if they're terse
- Identify breaking changes and highlight them prominently
${format === 'markdown' ? '- Use proper Markdown formatting with headers, lists, and emphasis' : ''}
${format === 'html' ? '- Use clean, semantic HTML formatting' : ''}
${format === 'plain' ? '- Use plain text with clear structure and bullet points' : ''}`
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.6,
      max_tokens: 2500,
    });

    const changelog = completion.choices[0]?.message?.content || 'Unable to generate changelog';

    // Generate a shorter summary
    const summaryCompletion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'Create a 1-2 sentence summary of the following changelog. Focus on the most important changes. Be concise and user-focused.'
        },
        {
          role: 'user',
          content: changelog,
        },
      ],
      temperature: 0.5,
      max_tokens: 150,
    });

    const summary = summaryCompletion.choices[0]?.message?.content || changelog.split('\n').slice(0, 2).join(' ');

    // Store the generated changelog
    if (targetVersionId) {
      await prisma.version.update({
        where: { id: targetVersionId },
        data: {
          aiChangelog: changelog,
          aiSummary: summary,
        },
      });
    }

    return NextResponse.json({
      changelog,
      summary,
      versionId: targetVersionId,
      releaseName: changelogData.releaseName,
    });
  } catch (error) {
    console.error('[GENERATE_CHANGELOG_POST]', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Check if release notes are generic/auto-generated
function isGenericReleaseNotes(text: string): boolean {
  const genericPatterns = [
    /^full changelog:/i,
    /^what's changed/i,
    /^\*\*full changelog\*\*/i,
    /^## what's changed/i,
    /^new contributors/i,
    /^bump \w+ from/i,
    /^dependency updates?$/i,
  ];

  return genericPatterns.some(pattern => pattern.test(text.trim()));
}

// Categorize commits by conventional commit types
function categorizeCommits(commits: Array<{ message: string; author: string; sha: string; date?: Date }>) {
  const categories: Record<string, Array<{ message: string; author: string; sha: string }>> = {
    features: [],
    fixes: [],
    breaking: [],
    performance: [],
    docs: [],
    refactor: [],
    style: [],
    tests: [],
    chore: [],
    other: [],
  };

  for (const commit of commits) {
    const message = commit.message.toLowerCase();
    const firstLine = commit.message.split('\n')[0];

    // Check for conventional commit format
    if (message.startsWith('feat:') || message.startsWith('feat(') || message.includes('feature')) {
      categories.features.push({ ...commit, message: firstLine });
    } else if (message.startsWith('fix:') || message.startsWith('fix(') || message.includes('bugfix') || message.includes('bug fix')) {
      categories.fixes.push({ ...commit, message: firstLine });
    } else if (message.includes('breaking') || message.includes('!:')) {
      categories.breaking.push({ ...commit, message: firstLine });
    } else if (message.startsWith('perf:') || message.startsWith('perf(') || message.includes('performance') || message.includes('optimize')) {
      categories.performance.push({ ...commit, message: firstLine });
    } else if (message.startsWith('docs:') || message.startsWith('docs(')) {
      categories.docs.push({ ...commit, message: firstLine });
    } else if (message.startsWith('refactor:') || message.startsWith('refactor(')) {
      categories.refactor.push({ ...commit, message: firstLine });
    } else if (message.startsWith('style:') || message.startsWith('style(')) {
      categories.style.push({ ...commit, message: firstLine });
    } else if (message.startsWith('test:') || message.startsWith('test(') || message.includes('test')) {
      categories.tests.push({ ...commit, message: firstLine });
    } else if (message.startsWith('chore:') || message.startsWith('chore(') || message.includes('merge') || message.includes('bump')) {
      categories.chore.push({ ...commit, message: firstLine });
    } else {
      // Try to infer from message content
      if (message.includes('add') || message.includes('new') || message.includes('create') || message.includes('implement')) {
        categories.features.push({ ...commit, message: firstLine });
      } else if (message.includes('fix') || message.includes('resolve') || message.includes('correct') || message.includes('patch')) {
        categories.fixes.push({ ...commit, message: firstLine });
      } else if (message.includes('update') || message.includes('improve') || message.includes('enhance')) {
        categories.features.push({ ...commit, message: firstLine });
      } else {
        categories.other.push({ ...commit, message: firstLine });
      }
    }
  }

  return categories;
}

function buildEnhancedChangelogPrompt(
  tagName: string,
  releaseName: string,
  data: {
    releaseNotes?: string;
    categorizedCommits: Record<string, Array<{ message: string; author: string; sha: string }>>;
    pullRequests: Array<{ title: string; body?: string; number: number; author?: string }>;
    issues: Array<{ key: string; title: string; type: string }>;
  },
  format: string
): string {
  const sections = [`Generate a professional, user-friendly changelog for release **${tagName}** (${releaseName}).\n`];

  // Add context about the source data quality
  sections.push(`IMPORTANT: Analyze all the provided data carefully and create meaningful, human-readable changelog entries. Even if commit messages are terse or use abbreviations, interpret them to create clear descriptions of what changed.\n`);

  if (data.releaseNotes) {
    sections.push(`## Official Release Notes (high priority):\n${data.releaseNotes}\n`);
  }

  // Add categorized commits
  const { categorizedCommits } = data;

  if (categorizedCommits.breaking.length > 0) {
    sections.push(`## ⚠️ Breaking Changes (${categorizedCommits.breaking.length}):\n${categorizedCommits.breaking.slice(0, 10).map(c => `- ${c.message}`).join('\n')}\n`);
  }

  if (categorizedCommits.features.length > 0) {
    sections.push(`## ✨ Features & Enhancements (${categorizedCommits.features.length}):\n${categorizedCommits.features.slice(0, 20).map(c => `- ${c.message}`).join('\n')}\n`);
  }

  if (categorizedCommits.fixes.length > 0) {
    sections.push(`## 🐛 Bug Fixes (${categorizedCommits.fixes.length}):\n${categorizedCommits.fixes.slice(0, 15).map(c => `- ${c.message}`).join('\n')}\n`);
  }

  if (categorizedCommits.performance.length > 0) {
    sections.push(`## ⚡ Performance Improvements (${categorizedCommits.performance.length}):\n${categorizedCommits.performance.slice(0, 10).map(c => `- ${c.message}`).join('\n')}\n`);
  }

  if (categorizedCommits.refactor.length > 0 || categorizedCommits.other.length > 0) {
    const otherChanges = [...categorizedCommits.refactor, ...categorizedCommits.other].slice(0, 10);
    if (otherChanges.length > 0) {
      sections.push(`## 🔧 Other Changes (${otherChanges.length}):\n${otherChanges.map(c => `- ${c.message}`).join('\n')}\n`);
    }
  }

  if (data.pullRequests.length > 0) {
    sections.push(`## Pull Requests Merged (${data.pullRequests.length}):\n${data.pullRequests.slice(0, 15).map(pr => `- PR #${pr.number}: ${pr.title}${pr.author ? ` (by ${pr.author})` : ''}${pr.body ? `\n  Description: ${pr.body.slice(0, 150)}...` : ''}`).join('\n')}\n`);
  }

  if (data.issues.length > 0) {
    const features = data.issues.filter(i => ['TASK', 'STORY', 'EPIC', 'FEATURE'].includes(i.type));
    const bugs = data.issues.filter(i => i.type === 'BUG');

    if (features.length > 0) {
      sections.push(`## Linked Features (${features.length}):\n${features.map(i => `- [${i.key}] ${i.title}`).join('\n')}\n`);
    }
    if (bugs.length > 0) {
      sections.push(`## Linked Bug Fixes (${bugs.length}):\n${bugs.map(i => `- [${i.key}] ${i.title}`).join('\n')}\n`);
    }
  }

  sections.push(`
INSTRUCTIONS:
1. Create a polished, professional changelog with these sections:
   - A brief, engaging overview (2-3 sentences highlighting key changes)
   - ✨ New Features & Enhancements
   - 🐛 Bug Fixes
   - ⚡ Performance Improvements (if applicable)
   - 🔧 Other Changes (if applicable)
   - ⚠️ Breaking Changes (if any - place at top if present)

2. For each item:
   - Rewrite terse commit messages into clear, user-friendly descriptions
   - Focus on what the change means for users, not how it was implemented
   - Group similar changes together
   - Remove duplicate or redundant entries

3. Style guidelines:
   - Use emojis for visual appeal
   - Keep descriptions concise but informative
   - Highlight the most impactful changes
   - Use active voice ("Added...", "Fixed...", "Improved...")

Format: ${format}
`);

  return sections.join('\n');
}
