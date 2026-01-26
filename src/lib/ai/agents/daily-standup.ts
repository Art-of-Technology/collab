/**
 * Daily Standup Summary Generator
 *
 * AI-powered service that generates daily standup summaries
 * based on recent activity, issue updates, and team progress.
 */

import { getAIOrchestrator } from '../core/orchestrator';
import { getAgentRegistry } from './agent-registry';
import type { AIModelId } from '../core/types';

// ============================================================================
// Types
// ============================================================================

export interface StandupContext {
  workspaceId: string;
  projectId?: string;
  teamMembers?: TeamMember[];
  recentIssues?: RecentIssue[];
  recentComments?: RecentComment[];
  sprintInfo?: SprintInfo;
  customInstructions?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

export interface RecentIssue {
  id: string;
  identifier: string;
  title: string;
  status: string;
  priority: string;
  type: string;
  assignee?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  storyPoints?: number;
}

export interface RecentComment {
  id: string;
  issueIdentifier: string;
  issueTitle: string;
  authorName: string;
  content: string;
  createdAt: Date;
}

export interface SprintInfo {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  totalPoints: number;
  completedPoints: number;
  issueCount: number;
  completedCount: number;
}

export interface StandupSummary {
  date: Date;
  workspaceId: string;
  projectId?: string;
  sections: {
    accomplished: StandupItem[];
    inProgress: StandupItem[];
    planned: StandupItem[];
    blockers: StandupItem[];
    highlights: string[];
    metrics: StandupMetrics;
  };
  fullSummary: string;
  agentName: string;
}

export interface StandupItem {
  text: string;
  issueId?: string;
  issueIdentifier?: string;
  assignee?: string;
  priority?: string;
}

export interface StandupMetrics {
  issuesCompleted: number;
  issuesCreated: number;
  issuesInProgress: number;
  storyPointsCompleted: number;
  sprintProgress?: number;
  teamVelocity?: number;
}

export interface StandupOptions {
  model?: AIModelId;
  includeMetrics?: boolean;
  includeBlockers?: boolean;
  maxItems?: number;
  focusAreas?: string[];
  timezone?: string;
}

// ============================================================================
// Default Options
// ============================================================================

const DEFAULT_OPTIONS: Required<StandupOptions> = {
  model: 'gpt-4o',
  includeMetrics: true,
  includeBlockers: true,
  maxItems: 10,
  focusAreas: [],
  timezone: 'UTC',
};

// ============================================================================
// Standup Generator Service
// ============================================================================

export class DailyStandupGenerator {
  private options: Required<StandupOptions>;

  constructor(options: StandupOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Generate a daily standup summary
   */
  async generateStandup(context: StandupContext): Promise<StandupSummary> {
    const orchestrator = getAIOrchestrator();
    const registry = getAgentRegistry();

    // Use Sage agent for planning/analysis tasks
    const agent = registry.getAgent('sage') || registry.getAgent('default-sage');
    const systemPrompt = agent?.systemPrompt || this.getDefaultSystemPrompt();

    // Build the context prompt
    const contextPrompt = this.buildContextPrompt(context);

    // Generate the standup summary
    const response = await orchestrator.complete({
      messages: [{ role: 'user', content: contextPrompt }],
      systemPrompt,
      model: this.options.model,
      maxTokens: 2500,
      temperature: 0.3, // Lower temperature for consistent formatting
    });

    // Parse the response
    const parsed = this.parseStandupResponse(response.content, context);

    return {
      date: new Date(),
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      sections: parsed,
      fullSummary: response.content,
      agentName: agent?.name || 'Sage',
    };
  }

  /**
   * Generate a quick standup from issue data only
   */
  async generateQuickStandup(
    issues: RecentIssue[],
    workspaceId: string
  ): Promise<string> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Categorize issues
    const completed = issues.filter(
      (i) => i.completedAt && new Date(i.completedAt) >= yesterday
    );
    const inProgress = issues.filter(
      (i) => i.status.toLowerCase().includes('progress') || i.status.toLowerCase().includes('doing')
    );
    const created = issues.filter(
      (i) => new Date(i.createdAt) >= yesterday
    );

    // Build simple summary
    let summary = `## Daily Standup - ${today.toLocaleDateString()}\n\n`;

    if (completed.length > 0) {
      summary += `### Completed (${completed.length})\n`;
      for (const issue of completed.slice(0, 5)) {
        summary += `- ${issue.identifier}: ${issue.title}\n`;
      }
      summary += '\n';
    }

    if (inProgress.length > 0) {
      summary += `### In Progress (${inProgress.length})\n`;
      for (const issue of inProgress.slice(0, 5)) {
        summary += `- ${issue.identifier}: ${issue.title}`;
        if (issue.assignee) summary += ` (${issue.assignee})`;
        summary += '\n';
      }
      summary += '\n';
    }

    if (created.length > 0) {
      summary += `### New Issues (${created.length})\n`;
      for (const issue of created.slice(0, 5)) {
        summary += `- ${issue.identifier}: ${issue.title} [${issue.priority}]\n`;
      }
    }

    return summary;
  }

  /**
   * Generate team member individual standups
   */
  async generateTeamStandups(
    context: StandupContext
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    if (!context.teamMembers || !context.recentIssues) {
      return results;
    }

    for (const member of context.teamMembers) {
      const memberIssues = context.recentIssues.filter(
        (i) => i.assignee === member.name || i.assignee === member.id
      );

      if (memberIssues.length === 0) {
        results.set(member.id, `No recent activity for ${member.name}`);
        continue;
      }

      const summary = await this.generateQuickStandup(memberIssues, context.workspaceId);
      results.set(member.id, `### ${member.name}\n${summary}`);
    }

    return results;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private getDefaultSystemPrompt(): string {
    return `You are Sage, an AI project management assistant specialized in generating clear, actionable standup summaries.

Your summaries should:
1. Be concise and scannable
2. Highlight important items first
3. Flag any blockers or risks
4. Include relevant metrics when available
5. Use professional but friendly tone

Format your response with clear sections:
- What was accomplished
- What's in progress
- What's planned for today
- Any blockers or concerns
- Key metrics

Use markdown formatting for readability.`;
  }

  private buildContextPrompt(context: StandupContext): string {
    let prompt = `Generate a daily standup summary for the team.\n\n`;

    // Add sprint context
    if (context.sprintInfo) {
      const sprint = context.sprintInfo;
      const daysRemaining = Math.ceil(
        (new Date(sprint.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      const progress = Math.round(
        (sprint.completedPoints / sprint.totalPoints) * 100
      );

      prompt += `**Sprint Context:**
- Sprint: ${sprint.name}
- Progress: ${progress}% (${sprint.completedPoints}/${sprint.totalPoints} points)
- Days remaining: ${daysRemaining}
- Issues: ${sprint.completedCount}/${sprint.issueCount} completed\n\n`;
    }

    // Add recent issues
    if (context.recentIssues && context.recentIssues.length > 0) {
      prompt += `**Recent Issue Activity:**\n`;

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      // Completed issues
      const completed = context.recentIssues.filter(
        (i) => i.completedAt && new Date(i.completedAt) >= yesterday
      );
      if (completed.length > 0) {
        prompt += `\nCompleted:\n`;
        for (const issue of completed.slice(0, this.options.maxItems)) {
          prompt += `- ${issue.identifier}: ${issue.title} (${issue.type}, ${issue.priority})`;
          if (issue.assignee) prompt += ` - ${issue.assignee}`;
          if (issue.storyPoints) prompt += ` [${issue.storyPoints}pts]`;
          prompt += '\n';
        }
      }

      // In progress issues
      const inProgress = context.recentIssues.filter(
        (i) =>
          i.status.toLowerCase().includes('progress') ||
          i.status.toLowerCase().includes('doing') ||
          i.status.toLowerCase().includes('review')
      );
      if (inProgress.length > 0) {
        prompt += `\nIn Progress:\n`;
        for (const issue of inProgress.slice(0, this.options.maxItems)) {
          prompt += `- ${issue.identifier}: ${issue.title} (${issue.status})`;
          if (issue.assignee) prompt += ` - ${issue.assignee}`;
          prompt += '\n';
        }
      }

      // New issues
      const created = context.recentIssues.filter(
        (i) => new Date(i.createdAt) >= yesterday
      );
      if (created.length > 0) {
        prompt += `\nNew Issues:\n`;
        for (const issue of created.slice(0, this.options.maxItems)) {
          prompt += `- ${issue.identifier}: ${issue.title} (${issue.type}, ${issue.priority})\n`;
        }
      }
    }

    // Add team members
    if (context.teamMembers && context.teamMembers.length > 0) {
      prompt += `\n**Team:** ${context.teamMembers.map((m) => m.name).join(', ')}\n`;
    }

    // Add recent comments for context
    if (context.recentComments && context.recentComments.length > 0) {
      prompt += `\n**Recent Discussion Highlights:**\n`;
      for (const comment of context.recentComments.slice(0, 5)) {
        prompt += `- ${comment.authorName} on ${comment.issueIdentifier}: "${comment.content.slice(0, 100)}..."\n`;
      }
    }

    // Add custom instructions
    if (context.customInstructions) {
      prompt += `\n**Additional Instructions:** ${context.customInstructions}\n`;
    }

    // Add focus areas
    if (this.options.focusAreas.length > 0) {
      prompt += `\n**Focus Areas:** ${this.options.focusAreas.join(', ')}\n`;
    }

    prompt += `\nPlease generate a comprehensive standup summary based on this information. Include:
1. Key accomplishments from yesterday
2. Work in progress
3. Plans for today
4. Any blockers or concerns
5. Relevant metrics

Use markdown formatting and keep it concise but informative.`;

    return prompt;
  }

  private parseStandupResponse(
    content: string,
    context: StandupContext
  ): StandupSummary['sections'] {
    // Basic parsing - extract sections from markdown
    const sections: StandupSummary['sections'] = {
      accomplished: [],
      inProgress: [],
      planned: [],
      blockers: [],
      highlights: [],
      metrics: {
        issuesCompleted: 0,
        issuesCreated: 0,
        issuesInProgress: 0,
        storyPointsCompleted: 0,
      },
    };

    // Calculate metrics from context
    if (context.recentIssues) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      sections.metrics.issuesCompleted = context.recentIssues.filter(
        (i) => i.completedAt && new Date(i.completedAt) >= yesterday
      ).length;

      sections.metrics.issuesCreated = context.recentIssues.filter(
        (i) => new Date(i.createdAt) >= yesterday
      ).length;

      sections.metrics.issuesInProgress = context.recentIssues.filter(
        (i) =>
          i.status.toLowerCase().includes('progress') ||
          i.status.toLowerCase().includes('doing')
      ).length;

      sections.metrics.storyPointsCompleted = context.recentIssues
        .filter((i) => i.completedAt && new Date(i.completedAt) >= yesterday)
        .reduce((sum, i) => sum + (i.storyPoints || 0), 0);
    }

    // Calculate sprint progress
    if (context.sprintInfo) {
      sections.metrics.sprintProgress = Math.round(
        (context.sprintInfo.completedPoints / context.sprintInfo.totalPoints) * 100
      );
    }

    // Extract items from content using regex patterns
    const accomplishedMatch = content.match(
      /(?:accomplished|completed|done|yesterday)[\s\S]*?(?=###|##|$)/i
    );
    if (accomplishedMatch) {
      const items = this.extractListItems(accomplishedMatch[0]);
      sections.accomplished = items.map((text) => ({ text }));
    }

    const progressMatch = content.match(
      /(?:in progress|working on|ongoing)[\s\S]*?(?=###|##|$)/i
    );
    if (progressMatch) {
      const items = this.extractListItems(progressMatch[0]);
      sections.inProgress = items.map((text) => ({ text }));
    }

    const plannedMatch = content.match(
      /(?:planned|today|upcoming|next)[\s\S]*?(?=###|##|$)/i
    );
    if (plannedMatch) {
      const items = this.extractListItems(plannedMatch[0]);
      sections.planned = items.map((text) => ({ text }));
    }

    const blockersMatch = content.match(
      /(?:blockers|concerns|risks|issues|impediments)[\s\S]*?(?=###|##|$)/i
    );
    if (blockersMatch) {
      const items = this.extractListItems(blockersMatch[0]);
      sections.blockers = items.map((text) => ({ text }));
    }

    return sections;
  }

  private extractListItems(text: string): string[] {
    const items: string[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      // Match list items (- or * or numbered)
      const match = trimmed.match(/^[-*•]\s+(.+)$|^\d+[.)]\s+(.+)$/);
      if (match) {
        items.push(match[1] || match[2]);
      }
    }

    return items;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let standupGeneratorInstance: DailyStandupGenerator | null = null;

export function getStandupGenerator(
  options?: StandupOptions
): DailyStandupGenerator {
  if (!standupGeneratorInstance) {
    standupGeneratorInstance = new DailyStandupGenerator(options);
  }
  return standupGeneratorInstance;
}
