/**
 * Automation Rule Execution Engine
 *
 * Executes automation rules in response to events (issue created, updated, etc.)
 * Supports various actions like auto-label, auto-assign, notifications, etc.
 */

import { getAutoTriageService } from './auto-triage';
import { getDuplicateDetectionService } from './duplicate-detection';
import { getAutoAssignService } from './auto-assign';
import { getAIOrchestrator } from '../core/orchestrator';

// ============================================================================
// Types
// ============================================================================

export type AutomationTriggerType =
  | 'issue.created'
  | 'issue.updated'
  | 'issue.status_changed'
  | 'issue.assigned'
  | 'issue.commented'
  | 'pr.opened'
  | 'pr.merged'
  | 'schedule.daily'
  | 'schedule.weekly'
  | 'manual';

export type AutomationActionType =
  | 'auto_triage'
  | 'auto_label'
  | 'auto_assign'
  | 'check_duplicates'
  | 'notify'
  | 'update_field'
  | 'add_comment'
  | 'generate_summary'
  | 'custom_ai';

export interface AutomationRule {
  id: string;
  name: string;
  description?: string;
  workspaceId: string;
  projectId?: string;
  agentId?: string;
  triggerType: AutomationTriggerType;
  triggerConditions: TriggerConditions;
  actionType: AutomationActionType;
  actionConfig: ActionConfig;
  isEnabled: boolean;
}

export interface TriggerConditions {
  // For issue triggers
  issueTypes?: string[];
  priorities?: string[];
  labels?: string[];
  hasLabel?: boolean;
  hasAssignee?: boolean;
  statusFrom?: string[];
  statusTo?: string[];

  // For PR triggers
  targetBranch?: string[];
  sourceBranch?: string[];

  // Custom conditions (evaluated at runtime)
  customCondition?: string;
}

export interface ActionConfig {
  // For auto_triage
  applyType?: boolean;
  applyPriority?: boolean;
  applyLabels?: boolean;
  applyStoryPoints?: boolean;
  requireConfirmation?: boolean;

  // For auto_label
  labelNames?: string[];

  // For auto_assign
  assigneeIds?: string[];
  considerWorkload?: boolean;

  // For check_duplicates
  threshold?: number;
  notifyIfFound?: boolean;
  autoLink?: boolean;

  // For notify
  channels?: ('email' | 'in_app' | 'slack')[];
  recipients?: string[];
  message?: string;

  // For update_field
  fieldName?: string;
  fieldValue?: unknown;

  // For add_comment
  commentTemplate?: string;

  // Shared AI option
  useAI?: boolean;

  // For generate_summary
  summaryType?: 'issue' | 'project' | 'sprint';

  // For custom_ai
  prompt?: string;
  model?: string;
}

export interface AutomationEvent {
  type: AutomationTriggerType;
  workspaceId: string;
  payload: EventPayload;
  timestamp: Date;
}

export interface EventPayload {
  // Issue events
  issue?: {
    id: string;
    title: string;
    description?: string;
    type: string;
    priority: string;
    status?: string;
    labels?: string[];
    assigneeId?: string;
    projectId: string;
  };
  previousValues?: Record<string, unknown>;
  changedFields?: string[];

  // PR events
  pullRequest?: {
    id: string;
    title: string;
    description?: string;
    sourceBranch: string;
    targetBranch: string;
  };

  // User context
  triggeredBy?: string;
}

export interface AutomationResult {
  ruleId: string;
  status: 'success' | 'failed' | 'skipped';
  actionType: AutomationActionType;
  result?: unknown;
  error?: string;
  durationMs: number;
}

// ============================================================================
// Automation Engine
// ============================================================================

export class AutomationEngine {
  private triageService = getAutoTriageService();
  private duplicateService = getDuplicateDetectionService();
  private assignService = getAutoAssignService();
  private orchestrator = getAIOrchestrator();

  /**
   * Process an event and execute matching automation rules
   */
  async processEvent(
    event: AutomationEvent,
    rules: AutomationRule[]
  ): Promise<AutomationResult[]> {
    const results: AutomationResult[] = [];

    // Filter rules that match the event
    const matchingRules = rules.filter(
      (rule) =>
        rule.isEnabled &&
        rule.triggerType === event.type &&
        this.matchesConditions(rule.triggerConditions, event.payload)
    );

    // Execute each matching rule
    for (const rule of matchingRules) {
      const startTime = Date.now();

      try {
        const result = await this.executeRule(rule, event);
        results.push({
          ruleId: rule.id,
          status: 'success',
          actionType: rule.actionType,
          result,
          durationMs: Date.now() - startTime,
        });
      } catch (error) {
        results.push({
          ruleId: rule.id,
          status: 'failed',
          actionType: rule.actionType,
          error: error instanceof Error ? error.message : 'Unknown error',
          durationMs: Date.now() - startTime,
        });
      }
    }

    return results;
  }

  /**
   * Execute a single automation rule
   */
  async executeRule(
    rule: AutomationRule,
    event: AutomationEvent
  ): Promise<unknown> {
    switch (rule.actionType) {
      case 'auto_triage':
        return this.executeAutoTriage(rule, event);

      case 'auto_label':
        return this.executeAutoLabel(rule, event);

      case 'auto_assign':
        return this.executeAutoAssign(rule, event);

      case 'check_duplicates':
        return this.executeCheckDuplicates(rule, event);

      case 'notify':
        return this.executeNotify(rule, event);

      case 'update_field':
        return this.executeUpdateField(rule, event);

      case 'add_comment':
        return this.executeAddComment(rule, event);

      case 'generate_summary':
        return this.executeGenerateSummary(rule, event);

      case 'custom_ai':
        return this.executeCustomAI(rule, event);

      default:
        throw new Error(`Unknown action type: ${rule.actionType}`);
    }
  }

  /**
   * Validate if an event matches rule conditions
   */
  matchesConditions(conditions: TriggerConditions, payload: EventPayload): boolean {
    const issue = payload.issue;

    // Issue type filter
    if (conditions.issueTypes && conditions.issueTypes.length > 0) {
      if (!issue || !conditions.issueTypes.includes(issue.type)) {
        return false;
      }
    }

    // Priority filter
    if (conditions.priorities && conditions.priorities.length > 0) {
      if (!issue || !conditions.priorities.includes(issue.priority)) {
        return false;
      }
    }

    // Label filter
    if (conditions.labels && conditions.labels.length > 0) {
      if (!issue?.labels) return false;
      const hasMatchingLabel = conditions.labels.some((l) =>
        issue.labels?.includes(l)
      );
      if (!hasMatchingLabel) return false;
    }

    // Has label filter
    if (conditions.hasLabel !== undefined) {
      const hasLabels = issue?.labels && issue.labels.length > 0;
      if (conditions.hasLabel !== hasLabels) return false;
    }

    // Has assignee filter
    if (conditions.hasAssignee !== undefined) {
      const hasAssignee = !!issue?.assigneeId;
      if (conditions.hasAssignee !== hasAssignee) return false;
    }

    // Status change filters
    if (conditions.statusFrom && conditions.statusFrom.length > 0) {
      const previousStatus = payload.previousValues?.status as string;
      if (!previousStatus || !conditions.statusFrom.includes(previousStatus)) {
        return false;
      }
    }

    if (conditions.statusTo && conditions.statusTo.length > 0) {
      if (!issue?.status || !conditions.statusTo.includes(issue.status)) {
        return false;
      }
    }

    // PR branch filters
    const pr = payload.pullRequest;
    if (conditions.targetBranch && conditions.targetBranch.length > 0) {
      if (!pr || !conditions.targetBranch.includes(pr.targetBranch)) {
        return false;
      }
    }

    if (conditions.sourceBranch && conditions.sourceBranch.length > 0) {
      if (!pr || !conditions.sourceBranch.includes(pr.sourceBranch)) {
        return false;
      }
    }

    return true;
  }

  // ============================================================================
  // Action Executors
  // ============================================================================

  private async executeAutoTriage(
    rule: AutomationRule,
    event: AutomationEvent
  ): Promise<unknown> {
    const issue = event.payload.issue;
    if (!issue) {
      throw new Error('No issue in event payload');
    }

    const suggestions = await this.triageService.analyzeIssue({
      title: issue.title,
      description: issue.description,
    });

    const config = rule.actionConfig;
    const updates: Record<string, unknown> = {};

    if (config.applyType !== false) {
      updates.type = suggestions.type;
    }

    if (config.applyPriority !== false) {
      updates.priority = suggestions.priority.value;
    }

    if (config.applyLabels !== false && suggestions.labels.length > 0) {
      updates.labels = suggestions.labels
        .filter((l) => l.isExisting)
        .map((l) => l.name);
    }

    if (config.applyStoryPoints !== false && suggestions.storyPoints) {
      updates.storyPoints = suggestions.storyPoints;
    }

    return {
      action: 'auto_triage',
      issueId: issue.id,
      suggestions,
      updates,
      requiresConfirmation: config.requireConfirmation ?? false,
    };
  }

  private async executeAutoLabel(
    rule: AutomationRule,
    event: AutomationEvent
  ): Promise<unknown> {
    const issue = event.payload.issue;
    if (!issue) {
      throw new Error('No issue in event payload');
    }

    const config = rule.actionConfig;
    let labelsToAdd: string[] = [];

    if (config.labelNames && config.labelNames.length > 0) {
      labelsToAdd = config.labelNames;
    } else if (config.useAI) {
      const suggestions = await this.triageService.suggestLabels(
        issue.title,
        issue.description,
        issue.labels || []
      );
      labelsToAdd = suggestions
        .filter((l) => l.isExisting && l.confidence > 0.6)
        .map((l) => l.name);
    }

    return {
      action: 'auto_label',
      issueId: issue.id,
      labelsToAdd,
    };
  }

  private async executeAutoAssign(
    rule: AutomationRule,
    event: AutomationEvent
  ): Promise<unknown> {
    const issue = event.payload.issue;
    if (!issue) {
      throw new Error('No issue in event payload');
    }

    const config = rule.actionConfig;

    // If specific assignees are configured, use them
    if (config.assigneeIds && config.assigneeIds.length > 0) {
      return {
        action: 'auto_assign',
        issueId: issue.id,
        assigneeId: config.assigneeIds[0],
        source: 'configured',
      };
    }

    // Otherwise, return a placeholder - actual team member lookup needs DB access
    return {
      action: 'auto_assign',
      issueId: issue.id,
      requiresTeamLookup: true,
      useAI: config.useAI ?? true,
      considerWorkload: config.considerWorkload ?? true,
    };
  }

  private async executeCheckDuplicates(
    rule: AutomationRule,
    event: AutomationEvent
  ): Promise<unknown> {
    const issue = event.payload.issue;
    if (!issue) {
      throw new Error('No issue in event payload');
    }

    // This returns metadata - actual duplicate check needs existing issues from DB
    return {
      action: 'check_duplicates',
      issueId: issue.id,
      title: issue.title,
      description: issue.description,
      threshold: rule.actionConfig.threshold ?? 0.75,
      notifyIfFound: rule.actionConfig.notifyIfFound ?? true,
      autoLink: rule.actionConfig.autoLink ?? false,
    };
  }

  private async executeNotify(
    rule: AutomationRule,
    event: AutomationEvent
  ): Promise<unknown> {
    const config = rule.actionConfig;

    // Build notification message
    let message = config.message || '';

    // Replace placeholders
    const issue = event.payload.issue;
    if (issue) {
      message = message
        .replace('{{issue.title}}', issue.title)
        .replace('{{issue.type}}', issue.type)
        .replace('{{issue.priority}}', issue.priority);
    }

    return {
      action: 'notify',
      channels: config.channels || ['in_app'],
      recipients: config.recipients || [],
      message,
      eventType: event.type,
    };
  }

  private async executeUpdateField(
    rule: AutomationRule,
    event: AutomationEvent
  ): Promise<unknown> {
    const issue = event.payload.issue;
    if (!issue) {
      throw new Error('No issue in event payload');
    }

    const config = rule.actionConfig;
    if (!config.fieldName) {
      throw new Error('Field name not configured');
    }

    return {
      action: 'update_field',
      issueId: issue.id,
      fieldName: config.fieldName,
      fieldValue: config.fieldValue,
    };
  }

  private async executeAddComment(
    rule: AutomationRule,
    event: AutomationEvent
  ): Promise<unknown> {
    const issue = event.payload.issue;
    if (!issue) {
      throw new Error('No issue in event payload');
    }

    const config = rule.actionConfig;
    let comment = config.commentTemplate || '';

    if (config.useAI && !comment) {
      // Generate AI comment based on event
      const prompt = `Generate a brief, helpful comment for an issue that was just ${event.type.replace('issue.', '')}.

Issue: "${issue.title}"
Type: ${issue.type}
Priority: ${issue.priority}

Keep the comment professional and under 100 words.`;

      comment = await this.orchestrator.quickComplete(prompt, {
        model: 'claude-haiku-3.5',
        temperature: 0.7,
      });
    }

    // Replace placeholders
    comment = comment
      .replace('{{issue.title}}', issue.title)
      .replace('{{event.type}}', event.type)
      .replace('{{timestamp}}', event.timestamp.toISOString());

    return {
      action: 'add_comment',
      issueId: issue.id,
      comment,
      isAutomated: true,
    };
  }

  private async executeGenerateSummary(
    rule: AutomationRule,
    event: AutomationEvent
  ): Promise<unknown> {
    const config = rule.actionConfig;
    const summaryType = config.summaryType || 'issue';

    // This returns metadata - actual summary generation needs more context
    return {
      action: 'generate_summary',
      summaryType,
      workspaceId: event.workspaceId,
      issueId: event.payload.issue?.id,
    };
  }

  private async executeCustomAI(
    rule: AutomationRule,
    event: AutomationEvent
  ): Promise<unknown> {
    const config = rule.actionConfig;

    if (!config.prompt) {
      throw new Error('Prompt not configured for custom AI action');
    }

    // Build context from event
    const context = JSON.stringify(event.payload, null, 2);

    const fullPrompt = `${config.prompt}

Event context:
${context}`;

    const response = await this.orchestrator.quickComplete(fullPrompt, {
      model: (config.model as any) || 'gpt-4o',
      temperature: 0.5,
    });

    return {
      action: 'custom_ai',
      prompt: config.prompt,
      response,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let automationEngineInstance: AutomationEngine | null = null;

export function getAutomationEngine(): AutomationEngine {
  if (!automationEngineInstance) {
    automationEngineInstance = new AutomationEngine();
  }
  return automationEngineInstance;
}
