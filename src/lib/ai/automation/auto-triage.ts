/**
 * Auto-Triage Service
 *
 * Automatically analyzes new issues and suggests:
 * - Issue type (BUG, TASK, STORY, etc.)
 * - Priority (low, medium, high, urgent)
 * - Labels based on content
 * - Story points estimation
 */

import { getAIOrchestrator } from '../core/orchestrator';
import type { AIModelId } from '../core/types';

// ============================================================================
// Types
// ============================================================================

export interface TriageInput {
  title: string;
  description?: string;
  projectContext?: {
    name: string;
    description?: string;
    existingLabels: string[];
  };
  workspaceContext?: {
    recentIssueTypes: string[];
    commonLabels: string[];
  };
}

export interface TriageSuggestion {
  type: IssueSuggestionType;
  priority: PrioritySuggestion;
  labels: LabelSuggestion[];
  storyPoints?: number;
  summary?: string;
  confidence: number;
  reasoning: string;
}

export type IssueSuggestionType =
  | 'BUG'
  | 'TASK'
  | 'STORY'
  | 'EPIC'
  | 'SUBTASK'
  | 'MILESTONE';

export interface PrioritySuggestion {
  value: 'low' | 'medium' | 'high' | 'urgent';
  confidence: number;
  reasoning: string;
}

export interface LabelSuggestion {
  name: string;
  isExisting: boolean;
  confidence: number;
}

// ============================================================================
// Auto-Triage Service
// ============================================================================

export class AutoTriageService {
  private orchestrator = getAIOrchestrator();
  private model: AIModelId = 'claude-haiku-3.5'; // Fast model for triage

  /**
   * Analyze an issue and generate triage suggestions
   */
  async analyzeIssue(input: TriageInput): Promise<TriageSuggestion> {
    const systemPrompt = this.buildSystemPrompt(input);

    const response = await this.orchestrator.quickComplete(
      this.buildUserPrompt(input),
      {
        systemPrompt,
        model: this.model,
        temperature: 0.2, // Low temperature for consistent results
        responseFormat: 'json',
      }
    );

    try {
      const parsed = JSON.parse(response);
      return this.validateAndNormalize(parsed, input);
    } catch {
      // Fallback to defaults if parsing fails
      return this.getDefaultSuggestion();
    }
  }

  /**
   * Quick classification of issue type only
   */
  async classifyType(
    title: string,
    description?: string
  ): Promise<IssueSuggestionType> {
    const types: IssueSuggestionType[] = [
      'BUG',
      'TASK',
      'STORY',
      'EPIC',
      'SUBTASK',
    ];

    const result = await this.orchestrator.classify(
      `Title: ${title}\n${description ? `Description: ${description}` : ''}`,
      types,
      `Classify this issue. BUG = defect/error to fix. TASK = specific work item. STORY = user-facing feature. EPIC = large multi-story feature. SUBTASK = small part of larger task.`
    );

    return result;
  }

  /**
   * Quick priority assessment
   */
  async assessPriority(
    title: string,
    description?: string,
    type?: string
  ): Promise<PrioritySuggestion> {
    const priorities = ['low', 'medium', 'high', 'urgent'] as const;

    const priorityDescriptions = {
      low: 'Nice to have, no deadline pressure',
      medium: 'Standard priority, normal workflow',
      high: 'Important, should be addressed soon',
      urgent: 'Critical, blocking work or production issue',
    };

    const context = `Issue type: ${type || 'TASK'}
Title: ${title}
${description ? `Description: ${description}` : ''}

Priority guidelines:
- urgent: Production issues, security vulnerabilities, blocking multiple people
- high: Important features, significant bugs, near deadline
- medium: Standard work items, planned features
- low: Nice-to-have, improvements, cleanup`;

    const result = await this.orchestrator.classify(
      context,
      [...priorities],
      'Assess the priority of this issue based on urgency and impact.'
    );

    return {
      value: result,
      confidence: 0.8,
      reasoning: priorityDescriptions[result],
    };
  }

  /**
   * Suggest labels based on content
   */
  async suggestLabels(
    title: string,
    description: string | undefined,
    existingLabels: string[]
  ): Promise<LabelSuggestion[]> {
    const systemPrompt = `You are a label suggestion system for a project management tool.

Given an issue title and description, suggest relevant labels.

Available labels in this workspace:
${existingLabels.length > 0 ? existingLabels.join(', ') : 'No existing labels yet'}

Guidelines:
1. Prefer existing labels when they match
2. Suggest new labels only if clearly needed
3. Limit suggestions to 3-5 most relevant labels
4. Use lowercase, hyphenated format for new labels (e.g., "api-integration")

Return JSON array:
[{"name": "label-name", "isExisting": true/false, "confidence": 0.0-1.0}]`;

    const response = await this.orchestrator.quickComplete(
      `Title: ${title}\n${description ? `Description: ${description}` : ''}`,
      {
        systemPrompt,
        model: this.model,
        temperature: 0.3,
        responseFormat: 'json',
      }
    );

    try {
      const parsed = JSON.parse(response);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => ({
          name: String(item.name || '').toLowerCase(),
          isExisting: existingLabels.some(
            (l) => l.toLowerCase() === String(item.name || '').toLowerCase()
          ),
          confidence: Number(item.confidence) || 0.5,
        }));
      }
    } catch {
      // Ignore parsing errors
    }

    return [];
  }

  /**
   * Estimate story points
   */
  async estimateStoryPoints(
    title: string,
    description?: string,
    type?: string
  ): Promise<number | undefined> {
    // Only estimate for stories and tasks
    if (type && !['STORY', 'TASK', 'BUG', 'SUBTASK'].includes(type)) {
      return undefined;
    }

    const fibonacciScale = [1, 2, 3, 5, 8, 13, 21];

    const systemPrompt = `You are a story point estimation assistant.

Estimate story points using the Fibonacci scale: ${fibonacciScale.join(', ')}

Guidelines:
- 1-2 points: Simple, well-understood, few hours of work
- 3-5 points: Medium complexity, clear scope, 1-2 days
- 8 points: Complex, some unknowns, 3-5 days
- 13 points: Very complex, multiple components, 1-2 weeks
- 21 points: Too large, should probably be broken down

Respond with ONLY a single number from the scale.`;

    const response = await this.orchestrator.quickComplete(
      `Type: ${type || 'TASK'}
Title: ${title}
${description ? `Description: ${description}` : ''}`,
      {
        systemPrompt,
        model: this.model,
        temperature: 0.1,
        maxTokens: 10,
      }
    );

    const estimate = parseInt(response.trim(), 10);
    if (fibonacciScale.includes(estimate)) {
      return estimate;
    }

    // Default to 3 if parsing fails
    return 3;
  }

  private buildSystemPrompt(input: TriageInput): string {
    const existingLabels = [
      ...(input.projectContext?.existingLabels || []),
      ...(input.workspaceContext?.commonLabels || []),
    ];

    return `You are an intelligent issue triage system for a project management tool.

Analyze the issue and provide classification suggestions in JSON format.

${input.projectContext ? `Project: ${input.projectContext.name}${input.projectContext.description ? ` - ${input.projectContext.description}` : ''}` : ''}

Available labels:
${existingLabels.length > 0 ? existingLabels.join(', ') : 'No existing labels - suggest new ones if appropriate'}

Issue Types:
- BUG: Defects, errors, things that are broken
- TASK: Specific work items, technical tasks
- STORY: User-facing features, described from user perspective
- EPIC: Large features spanning multiple stories
- SUBTASK: Small parts of a larger task
- MILESTONE: Major project milestones or releases

Priority Levels:
- urgent: Production issues, security vulnerabilities, blocking work
- high: Important, should be addressed soon
- medium: Standard priority, normal workflow
- low: Nice to have, no immediate pressure

Story Points (Fibonacci): 1, 2, 3, 5, 8, 13, 21

Response JSON schema:
{
  "type": "BUG|TASK|STORY|EPIC|SUBTASK|MILESTONE",
  "priority": {
    "value": "low|medium|high|urgent",
    "confidence": 0.0-1.0,
    "reasoning": "brief explanation"
  },
  "labels": [
    {"name": "label-name", "isExisting": true|false, "confidence": 0.0-1.0}
  ],
  "storyPoints": number|null,
  "summary": "1-2 sentence summary of the issue",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation of overall classification"
}`;
  }

  private buildUserPrompt(input: TriageInput): string {
    return `Please analyze and triage this issue:

Title: ${input.title}
${input.description ? `\nDescription:\n${input.description}` : ''}`;
  }

  private validateAndNormalize(
    parsed: Record<string, unknown>,
    input: TriageInput
  ): TriageSuggestion {
    const validTypes: IssueSuggestionType[] = [
      'BUG',
      'TASK',
      'STORY',
      'EPIC',
      'SUBTASK',
      'MILESTONE',
    ];
    const validPriorities = ['low', 'medium', 'high', 'urgent'] as const;

    // Normalize type
    let type: IssueSuggestionType = 'TASK';
    if (
      typeof parsed.type === 'string' &&
      validTypes.includes(parsed.type as IssueSuggestionType)
    ) {
      type = parsed.type as IssueSuggestionType;
    }

    // Normalize priority
    let priority: PrioritySuggestion = {
      value: 'medium',
      confidence: 0.5,
      reasoning: 'Default priority',
    };
    if (parsed.priority && typeof parsed.priority === 'object') {
      const p = parsed.priority as Record<string, unknown>;
      if (
        typeof p.value === 'string' &&
        validPriorities.includes(p.value as (typeof validPriorities)[number])
      ) {
        priority = {
          value: p.value as (typeof validPriorities)[number],
          confidence: typeof p.confidence === 'number' ? p.confidence : 0.7,
          reasoning:
            typeof p.reasoning === 'string' ? p.reasoning : 'AI suggested',
        };
      }
    }

    // Normalize labels
    const existingLabels = [
      ...(input.projectContext?.existingLabels || []),
      ...(input.workspaceContext?.commonLabels || []),
    ].map((l) => l.toLowerCase());

    let labels: LabelSuggestion[] = [];
    if (Array.isArray(parsed.labels)) {
      labels = parsed.labels
        .filter(
          (l): l is Record<string, unknown> => l && typeof l === 'object'
        )
        .map((l) => ({
          name: String(l.name || '').toLowerCase(),
          isExisting: existingLabels.includes(
            String(l.name || '').toLowerCase()
          ),
          confidence: typeof l.confidence === 'number' ? l.confidence : 0.5,
        }))
        .filter((l) => l.name.length > 0);
    }

    // Story points
    let storyPoints: number | undefined;
    if (
      typeof parsed.storyPoints === 'number' &&
      [1, 2, 3, 5, 8, 13, 21].includes(parsed.storyPoints)
    ) {
      storyPoints = parsed.storyPoints;
    }

    return {
      type,
      priority,
      labels,
      storyPoints,
      summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
      reasoning:
        typeof parsed.reasoning === 'string'
          ? parsed.reasoning
          : 'AI classification',
    };
  }

  private getDefaultSuggestion(): TriageSuggestion {
    return {
      type: 'TASK',
      priority: {
        value: 'medium',
        confidence: 0.5,
        reasoning: 'Default priority - unable to analyze',
      },
      labels: [],
      confidence: 0.3,
      reasoning: 'Unable to fully analyze the issue',
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let triageServiceInstance: AutoTriageService | null = null;

export function getAutoTriageService(): AutoTriageService {
  if (!triageServiceInstance) {
    triageServiceInstance = new AutoTriageService();
  }
  return triageServiceInstance;
}
