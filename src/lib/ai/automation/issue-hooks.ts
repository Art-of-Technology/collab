/**
 * Issue Lifecycle Hooks
 *
 * Integration helpers to connect AI automation with issue create/update flows.
 * These hooks can be called from your existing issue API routes.
 */

import {
  getAutoTriageService,
  getDuplicateDetectionService,
  getAutomationEngine,
  type IssueForDuplication,
  type TriageSuggestion,
  type DuplicateSearchResult,
  type AutomationRule,
  type AutomationResult,
} from './index';

// ============================================================================
// Types
// ============================================================================

export interface IssueCreatedPayload {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  priority: string;
  status?: string;
  labels?: string[];
  assigneeId?: string | null;
  projectId: string;
  workspaceId: string;
  reporterId?: string;
}

export interface IssueUpdatedPayload extends IssueCreatedPayload {
  previousValues: Record<string, unknown>;
  changedFields: string[];
}

export interface OnIssueCreatedResult {
  triageSuggestions?: TriageSuggestion;
  duplicateCheck?: DuplicateSearchResult;
  automationResults?: AutomationResult[];
}

export interface OnIssueUpdatedResult {
  automationResults?: AutomationResult[];
}

export interface AutomationContext {
  workspaceId: string;
  projectId: string;
  existingIssues?: IssueForDuplication[];
  automationRules?: AutomationRule[];
  existingLabels?: string[];
}

// ============================================================================
// Hook Functions
// ============================================================================

/**
 * Hook to call when a new issue is created
 *
 * This function:
 * 1. Runs auto-triage to suggest type, priority, labels
 * 2. Checks for potential duplicates
 * 3. Executes any matching automation rules
 *
 * @example
 * ```typescript
 * // In your issue creation API route:
 * const newIssue = await prisma.issue.create({ ... });
 *
 * const aiResults = await onIssueCreated(newIssue, {
 *   workspaceId: newIssue.workspaceId,
 *   projectId: newIssue.projectId,
 *   existingIssues: await getProjectIssues(newIssue.projectId),
 *   existingLabels: await getProjectLabels(newIssue.projectId),
 * });
 *
 * if (aiResults.triageSuggestions) {
 *   // Optionally auto-apply suggestions or show to user
 * }
 *
 * if (aiResults.duplicateCheck?.candidates.length > 0) {
 *   // Warn user about potential duplicates
 * }
 * ```
 */
export async function onIssueCreated(
  issue: IssueCreatedPayload,
  context: AutomationContext
): Promise<OnIssueCreatedResult> {
  const result: OnIssueCreatedResult = {};

  try {
    // 1. Auto-triage
    const triageService = getAutoTriageService();
    result.triageSuggestions = await triageService.analyzeIssue({
      title: issue.title,
      description: issue.description || undefined,
      projectContext: {
        name: '', // Would need to pass project name
        existingLabels: context.existingLabels || [],
      },
    });
  } catch (error) {
    console.error('Auto-triage failed:', error);
  }

  try {
    // 2. Duplicate detection (if existing issues provided)
    if (context.existingIssues && context.existingIssues.length > 0) {
      const duplicateService = getDuplicateDetectionService();
      result.duplicateCheck = await duplicateService.findDuplicates(
        { title: issue.title, description: issue.description },
        context.existingIssues.filter((i) => i.id !== issue.id),
        { maxCandidates: 3, threshold: 0.75, includeExplanation: true }
      );
    }
  } catch (error) {
    console.error('Duplicate detection failed:', error);
  }

  try {
    // 3. Execute automation rules
    if (context.automationRules && context.automationRules.length > 0) {
      const engine = getAutomationEngine();
      result.automationResults = await engine.processEvent(
        {
          type: 'issue.created',
          workspaceId: context.workspaceId,
          payload: {
            issue: {
              id: issue.id,
              title: issue.title,
              description: issue.description || undefined,
              type: issue.type,
              priority: issue.priority,
              status: issue.status,
              labels: issue.labels,
              assigneeId: issue.assigneeId || undefined,
              projectId: issue.projectId,
            },
          },
          timestamp: new Date(),
        },
        context.automationRules
      );
    }
  } catch (error) {
    console.error('Automation execution failed:', error);
  }

  return result;
}

/**
 * Hook to call when an issue is updated
 *
 * @example
 * ```typescript
 * // In your issue update API route:
 * const previousIssue = await prisma.issue.findUnique({ ... });
 * const updatedIssue = await prisma.issue.update({ ... });
 *
 * const aiResults = await onIssueUpdated(
 *   { ...updatedIssue, previousValues, changedFields },
 *   { workspaceId, projectId, automationRules }
 * );
 * ```
 */
export async function onIssueUpdated(
  issue: IssueUpdatedPayload,
  context: AutomationContext
): Promise<OnIssueUpdatedResult> {
  const result: OnIssueUpdatedResult = {};

  try {
    // Execute automation rules
    if (context.automationRules && context.automationRules.length > 0) {
      const engine = getAutomationEngine();

      // Determine event type based on changes
      let eventType: 'issue.updated' | 'issue.status_changed' | 'issue.assigned' =
        'issue.updated';

      if (issue.changedFields.includes('status') || issue.changedFields.includes('statusId')) {
        eventType = 'issue.status_changed';
      } else if (issue.changedFields.includes('assigneeId')) {
        eventType = 'issue.assigned';
      }

      result.automationResults = await engine.processEvent(
        {
          type: eventType,
          workspaceId: context.workspaceId,
          payload: {
            issue: {
              id: issue.id,
              title: issue.title,
              description: issue.description || undefined,
              type: issue.type,
              priority: issue.priority,
              status: issue.status,
              labels: issue.labels,
              assigneeId: issue.assigneeId || undefined,
              projectId: issue.projectId,
            },
            previousValues: issue.previousValues,
            changedFields: issue.changedFields,
          },
          timestamp: new Date(),
        },
        context.automationRules
      );
    }
  } catch (error) {
    console.error('Automation execution failed:', error);
  }

  return result;
}

/**
 * Invalidate embedding cache when issue content changes
 */
export function invalidateIssueCache(issueId: string): void {
  const duplicateService = getDuplicateDetectionService();
  duplicateService.invalidateCache(issueId);
}

/**
 * Pre-generate embeddings for a batch of issues
 * Useful for initializing semantic search on existing data
 */
export async function preGenerateEmbeddings(
  issues: IssueForDuplication[]
): Promise<void> {
  const duplicateService = getDuplicateDetectionService();

  for (const issue of issues) {
    try {
      await duplicateService.generateAndCacheEmbedding(issue);
    } catch (error) {
      console.error(`Failed to generate embedding for issue ${issue.id}:`, error);
    }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get quick triage for issue title (without full analysis)
 * Useful for real-time suggestions while typing
 */
export async function quickTriageType(
  title: string
): Promise<{ type: string; confidence: number }> {
  const triageService = getAutoTriageService();
  const type = await triageService.classifyType(title);
  return { type, confidence: 0.8 };
}

/**
 * Quick duplicate check (title only)
 * Useful for real-time warnings while typing
 */
export async function quickDuplicateCheck(
  title: string,
  existingTitles: Array<{ id: string; title: string }>
): Promise<Array<{ id: string; title: string; similarity: number }>> {
  const normalizedInput = title.toLowerCase().trim();

  return existingTitles
    .map((issue) => {
      const normalizedTitle = issue.title.toLowerCase().trim();

      // Simple Jaccard similarity
      const inputWords = normalizedInput.split(/\s+/);
      const titleWords = normalizedTitle.split(/\s+/);
      const inputSet = new Set(inputWords);
      const titleSet = new Set(titleWords);

      const intersectionArr = inputWords.filter((w) => titleSet.has(w));
      const unionArr = Array.from(new Set([...inputWords, ...titleWords]));
      const intersection = { size: new Set(intersectionArr).size };
      const union = { size: unionArr.length };

      const similarity = intersection.size / union.size;

      return { ...issue, similarity };
    })
    .filter((result) => result.similarity > 0.5)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);
}
