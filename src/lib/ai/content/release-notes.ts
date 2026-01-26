/**
 * Release Notes Generator
 *
 * AI-powered service that generates professional release notes
 * from completed issues, pull requests, and changelog data.
 */

import { getAIOrchestrator } from '../core/orchestrator';
import { getAgentRegistry } from '../agents/agent-registry';
import type { AIModelId } from '../core/types';

// ============================================================================
// Types
// ============================================================================

export interface ReleaseData {
  version: string;
  releaseName?: string;
  releaseDate: Date;
  previousVersion?: string;
  issues: ReleaseIssue[];
  pullRequests?: PullRequest[];
  commits?: CommitInfo[];
  contributors?: Contributor[];
  breakingChanges?: string[];
  deprecations?: string[];
}

export interface ReleaseIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  type: 'feature' | 'bug' | 'enhancement' | 'chore' | 'docs' | 'other';
  priority: string;
  labels?: string[];
  component?: string;
  assignee?: string;
  completedAt: Date;
}

export interface PullRequest {
  id: string;
  number: number;
  title: string;
  description?: string;
  author: string;
  labels?: string[];
  mergedAt: Date;
  linkedIssues?: string[];
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  date: Date;
}

export interface Contributor {
  name: string;
  username?: string;
  contributions: number;
  role?: string;
}

export type ReleaseNoteFormat = 'markdown' | 'html' | 'plain' | 'slack';
export type ReleaseNoteStyle = 'technical' | 'user-friendly' | 'marketing' | 'changelog';

export interface ReleaseNotes {
  version: string;
  releaseDate: Date;
  title: string;
  summary: string;
  sections: {
    highlights?: string[];
    features: ReleaseNoteItem[];
    bugFixes: ReleaseNoteItem[];
    enhancements: ReleaseNoteItem[];
    breakingChanges: ReleaseNoteItem[];
    deprecations: ReleaseNoteItem[];
    other: ReleaseNoteItem[];
  };
  contributors: string[];
  fullContent: string;
  agentName: string;
}

export interface ReleaseNoteItem {
  title: string;
  description?: string;
  issueId?: string;
  prNumber?: number;
  component?: string;
  impact?: 'high' | 'medium' | 'low';
}

export interface ReleaseNotesOptions {
  model?: AIModelId;
  format?: ReleaseNoteFormat;
  style?: ReleaseNoteStyle;
  includeIssueLinks?: boolean;
  includePRLinks?: boolean;
  includeContributors?: boolean;
  maxItemsPerSection?: number;
  customTemplate?: string;
  targetAudience?: string;
}

// ============================================================================
// Default Options
// ============================================================================

const DEFAULT_OPTIONS: Required<ReleaseNotesOptions> = {
  model: 'gpt-4o',
  format: 'markdown',
  style: 'user-friendly',
  includeIssueLinks: true,
  includePRLinks: true,
  includeContributors: true,
  maxItemsPerSection: 20,
  customTemplate: '',
  targetAudience: 'developers and users',
};

// ============================================================================
// Release Notes Generator
// ============================================================================

export class ReleaseNotesGenerator {
  private options: Required<ReleaseNotesOptions>;

  constructor(options: ReleaseNotesOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Generate comprehensive release notes
   */
  async generateReleaseNotes(release: ReleaseData): Promise<ReleaseNotes> {
    const orchestrator = getAIOrchestrator();
    const registry = getAgentRegistry();

    // Use Quinn (writer) agent for content generation
    const agent = registry.getAgent('quinn') || registry.getAgent('default-quinn');
    const systemPrompt = agent?.systemPrompt || this.getDefaultSystemPrompt();

    // Categorize issues
    const categorized = this.categorizeIssues(release.issues);

    // Build the prompt
    const prompt = this.buildPrompt(release, categorized);

    // Generate AI content
    const response = await orchestrator.complete({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt,
      model: this.options.model,
      maxTokens: 3000,
      temperature: 0.4,
    });

    // Parse and structure the response
    const notes = this.parseResponse(response.content, release, categorized);

    return {
      ...notes,
      agentName: agent?.name || 'Quinn',
    };
  }

  /**
   * Generate a quick changelog entry
   */
  async generateChangelog(release: ReleaseData): Promise<string> {
    const categorized = this.categorizeIssues(release.issues);

    let changelog = `## [${release.version}] - ${release.releaseDate.toISOString().split('T')[0]}\n\n`;

    if (categorized.features.length > 0) {
      changelog += `### Added\n`;
      for (const issue of categorized.features.slice(0, this.options.maxItemsPerSection)) {
        changelog += `- ${issue.title}`;
        if (this.options.includeIssueLinks) changelog += ` (${issue.identifier})`;
        changelog += '\n';
      }
      changelog += '\n';
    }

    if (categorized.enhancements.length > 0) {
      changelog += `### Changed\n`;
      for (const issue of categorized.enhancements.slice(0, this.options.maxItemsPerSection)) {
        changelog += `- ${issue.title}`;
        if (this.options.includeIssueLinks) changelog += ` (${issue.identifier})`;
        changelog += '\n';
      }
      changelog += '\n';
    }

    if (categorized.bugFixes.length > 0) {
      changelog += `### Fixed\n`;
      for (const issue of categorized.bugFixes.slice(0, this.options.maxItemsPerSection)) {
        changelog += `- ${issue.title}`;
        if (this.options.includeIssueLinks) changelog += ` (${issue.identifier})`;
        changelog += '\n';
      }
      changelog += '\n';
    }

    if (release.breakingChanges && release.breakingChanges.length > 0) {
      changelog += `### Breaking Changes\n`;
      for (const change of release.breakingChanges) {
        changelog += `- ${change}\n`;
      }
      changelog += '\n';
    }

    if (release.deprecations && release.deprecations.length > 0) {
      changelog += `### Deprecated\n`;
      for (const dep of release.deprecations) {
        changelog += `- ${dep}\n`;
      }
      changelog += '\n';
    }

    return changelog;
  }

  /**
   * Generate release notes for a specific format
   */
  async generateForFormat(
    release: ReleaseData,
    format: ReleaseNoteFormat
  ): Promise<string> {
    const notes = await this.generateReleaseNotes(release);

    switch (format) {
      case 'html':
        return this.convertToHtml(notes);
      case 'plain':
        return this.convertToPlain(notes);
      case 'slack':
        return this.convertToSlack(notes);
      default:
        return notes.fullContent;
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private getDefaultSystemPrompt(): string {
    return `You are Quinn, a technical writer AI specializing in creating clear, professional release notes.

Your release notes should:
1. Be scannable and well-organized
2. Highlight the most impactful changes first
3. Use clear, concise language appropriate for the target audience
4. Group related changes logically
5. Include relevant technical details without being overwhelming

Style guidelines:
- Technical: Focus on implementation details, API changes, and technical impact
- User-friendly: Focus on benefits, use cases, and user-facing changes
- Marketing: Focus on value proposition, highlights, and compelling narratives
- Changelog: Follow Keep a Changelog format strictly`;
  }

  private categorizeIssues(issues: ReleaseIssue[]): {
    features: ReleaseIssue[];
    bugFixes: ReleaseIssue[];
    enhancements: ReleaseIssue[];
    other: ReleaseIssue[];
  } {
    const features: ReleaseIssue[] = [];
    const bugFixes: ReleaseIssue[] = [];
    const enhancements: ReleaseIssue[] = [];
    const other: ReleaseIssue[] = [];

    for (const issue of issues) {
      switch (issue.type) {
        case 'feature':
          features.push(issue);
          break;
        case 'bug':
          bugFixes.push(issue);
          break;
        case 'enhancement':
          enhancements.push(issue);
          break;
        default:
          other.push(issue);
      }
    }

    // Sort by priority
    const priorityOrder: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    const sortByPriority = (a: ReleaseIssue, b: ReleaseIssue) =>
      (priorityOrder[a.priority.toLowerCase()] ?? 4) -
      (priorityOrder[b.priority.toLowerCase()] ?? 4);

    return {
      features: features.sort(sortByPriority),
      bugFixes: bugFixes.sort(sortByPriority),
      enhancements: enhancements.sort(sortByPriority),
      other: other.sort(sortByPriority),
    };
  }

  private buildPrompt(
    release: ReleaseData,
    categorized: ReturnType<typeof this.categorizeIssues>
  ): string {
    let prompt = `Generate release notes for version ${release.version}`;
    if (release.releaseName) prompt += ` "${release.releaseName}"`;
    prompt += `.\n\n`;

    prompt += `**Target Audience:** ${this.options.targetAudience}\n`;
    prompt += `**Style:** ${this.options.style}\n`;
    prompt += `**Format:** ${this.options.format}\n\n`;

    // Features
    if (categorized.features.length > 0) {
      prompt += `**New Features (${categorized.features.length}):**\n`;
      for (const issue of categorized.features.slice(0, this.options.maxItemsPerSection)) {
        prompt += `- ${issue.identifier}: ${issue.title}`;
        if (issue.description) prompt += ` - ${issue.description.slice(0, 150)}`;
        if (issue.component) prompt += ` [${issue.component}]`;
        prompt += '\n';
      }
      prompt += '\n';
    }

    // Bug fixes
    if (categorized.bugFixes.length > 0) {
      prompt += `**Bug Fixes (${categorized.bugFixes.length}):**\n`;
      for (const issue of categorized.bugFixes.slice(0, this.options.maxItemsPerSection)) {
        prompt += `- ${issue.identifier}: ${issue.title}`;
        if (issue.priority.toLowerCase() === 'critical') prompt += ' [CRITICAL]';
        prompt += '\n';
      }
      prompt += '\n';
    }

    // Enhancements
    if (categorized.enhancements.length > 0) {
      prompt += `**Improvements (${categorized.enhancements.length}):**\n`;
      for (const issue of categorized.enhancements.slice(0, this.options.maxItemsPerSection)) {
        prompt += `- ${issue.identifier}: ${issue.title}\n`;
      }
      prompt += '\n';
    }

    // Breaking changes
    if (release.breakingChanges && release.breakingChanges.length > 0) {
      prompt += `**Breaking Changes:**\n`;
      for (const change of release.breakingChanges) {
        prompt += `- ${change}\n`;
      }
      prompt += '\n';
    }

    // Deprecations
    if (release.deprecations && release.deprecations.length > 0) {
      prompt += `**Deprecations:**\n`;
      for (const dep of release.deprecations) {
        prompt += `- ${dep}\n`;
      }
      prompt += '\n';
    }

    // Contributors
    if (release.contributors && release.contributors.length > 0 && this.options.includeContributors) {
      prompt += `**Contributors:** ${release.contributors.map((c) => c.name).join(', ')}\n\n`;
    }

    // Custom template
    if (this.options.customTemplate) {
      prompt += `**Template to follow:**\n${this.options.customTemplate}\n\n`;
    }

    prompt += `Please generate comprehensive release notes with:
1. An engaging title for the release
2. A brief summary (2-3 sentences) highlighting key changes
3. Organized sections for features, fixes, improvements
4. Breaking changes prominently noted if any
5. Acknowledgment of contributors if provided

Format the output as ${this.options.format}.`;

    return prompt;
  }

  private parseResponse(
    content: string,
    release: ReleaseData,
    categorized: ReturnType<typeof this.categorizeIssues>
  ): Omit<ReleaseNotes, 'agentName'> {
    // Extract highlights from content
    const highlightsMatch = content.match(/(?:highlights?|key changes?)[\s\S]*?(?=##|$)/i);
    const highlights: string[] = [];
    if (highlightsMatch) {
      const lines = highlightsMatch[0].split('\n');
      for (const line of lines) {
        const match = line.match(/^[-*•]\s+(.+)$/);
        if (match) highlights.push(match[1]);
      }
    }

    // Map issues to release note items
    const toItem = (issue: ReleaseIssue): ReleaseNoteItem => ({
      title: issue.title,
      description: issue.description,
      issueId: issue.identifier,
      component: issue.component,
      impact: issue.priority.toLowerCase() === 'critical' || issue.priority.toLowerCase() === 'high'
        ? 'high'
        : issue.priority.toLowerCase() === 'medium'
        ? 'medium'
        : 'low',
    });

    // Extract summary from content
    const summaryMatch = content.match(/(?:summary|overview)[\s\S]*?(?=##|$)/i);
    const summary = summaryMatch
      ? summaryMatch[0].replace(/(?:summary|overview)[:\s]*/i, '').trim().split('\n')[0]
      : `Release ${release.version} includes ${categorized.features.length} new features and ${categorized.bugFixes.length} bug fixes.`;

    // Extract title
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch
      ? titleMatch[1]
      : `${release.releaseName || `Version ${release.version}`}`;

    return {
      version: release.version,
      releaseDate: release.releaseDate,
      title,
      summary,
      sections: {
        highlights: highlights.slice(0, 5),
        features: categorized.features.map(toItem),
        bugFixes: categorized.bugFixes.map(toItem),
        enhancements: categorized.enhancements.map(toItem),
        breakingChanges: (release.breakingChanges || []).map((text) => ({
          title: text,
          impact: 'high' as const,
        })),
        deprecations: (release.deprecations || []).map((text) => ({
          title: text,
          impact: 'medium' as const,
        })),
        other: categorized.other.map(toItem),
      },
      contributors: (release.contributors || []).map((c) => c.name),
      fullContent: content,
    };
  }

  private convertToHtml(notes: ReleaseNotes): string {
    let html = `<article class="release-notes">
<header>
<h1>${notes.title}</h1>
<time datetime="${notes.releaseDate.toISOString()}">${notes.releaseDate.toLocaleDateString()}</time>
</header>

<section class="summary">
<p>${notes.summary}</p>
</section>
`;

    if (notes.sections.highlights && notes.sections.highlights.length > 0) {
      html += `<section class="highlights">
<h2>Highlights</h2>
<ul>
${notes.sections.highlights.map((h) => `<li>${h}</li>`).join('\n')}
</ul>
</section>
`;
    }

    if (notes.sections.features.length > 0) {
      html += `<section class="features">
<h2>New Features</h2>
<ul>
${notes.sections.features.map((f) => `<li><strong>${f.title}</strong>${f.description ? `: ${f.description}` : ''}</li>`).join('\n')}
</ul>
</section>
`;
    }

    if (notes.sections.bugFixes.length > 0) {
      html += `<section class="fixes">
<h2>Bug Fixes</h2>
<ul>
${notes.sections.bugFixes.map((f) => `<li>${f.title}</li>`).join('\n')}
</ul>
</section>
`;
    }

    html += `</article>`;
    return html;
  }

  private convertToPlain(notes: ReleaseNotes): string {
    let plain = `${notes.title}\n${'='.repeat(notes.title.length)}\n\n`;
    plain += `${notes.summary}\n\n`;

    if (notes.sections.features.length > 0) {
      plain += `NEW FEATURES\n`;
      for (const f of notes.sections.features) {
        plain += `* ${f.title}\n`;
      }
      plain += '\n';
    }

    if (notes.sections.bugFixes.length > 0) {
      plain += `BUG FIXES\n`;
      for (const f of notes.sections.bugFixes) {
        plain += `* ${f.title}\n`;
      }
      plain += '\n';
    }

    return plain;
  }

  private convertToSlack(notes: ReleaseNotes): string {
    let slack = `:rocket: *${notes.title}*\n\n`;
    slack += `${notes.summary}\n\n`;

    if (notes.sections.highlights && notes.sections.highlights.length > 0) {
      slack += `:star: *Highlights*\n`;
      for (const h of notes.sections.highlights) {
        slack += `• ${h}\n`;
      }
      slack += '\n';
    }

    if (notes.sections.features.length > 0) {
      slack += `:sparkles: *New Features*\n`;
      for (const f of notes.sections.features.slice(0, 5)) {
        slack += `• ${f.title}\n`;
      }
      if (notes.sections.features.length > 5) {
        slack += `_...and ${notes.sections.features.length - 5} more_\n`;
      }
      slack += '\n';
    }

    if (notes.sections.bugFixes.length > 0) {
      slack += `:bug: *Bug Fixes*\n`;
      for (const f of notes.sections.bugFixes.slice(0, 5)) {
        slack += `• ${f.title}\n`;
      }
      if (notes.sections.bugFixes.length > 5) {
        slack += `_...and ${notes.sections.bugFixes.length - 5} more_\n`;
      }
    }

    return slack;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let releaseNotesGeneratorInstance: ReleaseNotesGenerator | null = null;

export function getReleaseNotesGenerator(
  options?: ReleaseNotesOptions
): ReleaseNotesGenerator {
  if (!releaseNotesGeneratorInstance) {
    releaseNotesGeneratorInstance = new ReleaseNotesGenerator(options);
  }
  return releaseNotesGeneratorInstance;
}
