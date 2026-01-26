/**
 * AI Automation Module Exports
 *
 * This module provides intelligent automation capabilities for Collab.
 */

// Auto-Triage
export {
  AutoTriageService,
  getAutoTriageService,
  type TriageInput,
  type TriageSuggestion,
  type IssueSuggestionType,
  type PrioritySuggestion,
  type LabelSuggestion,
} from './auto-triage';

// Duplicate Detection
export {
  DuplicateDetectionService,
  getDuplicateDetectionService,
  type IssueForDuplication,
  type DuplicateCandidate,
  type DuplicateSearchResult,
} from './duplicate-detection';

// Auto-Assign
export {
  AutoAssignService,
  getAutoAssignService,
  type TeamMember,
  type IssueForAssignment,
  type AssignmentSuggestion,
  type AssignmentResult,
  type WorkloadAnalysis,
} from './auto-assign';

// Automation Engine
export {
  AutomationEngine,
  getAutomationEngine,
  type AutomationTriggerType,
  type AutomationActionType,
  type AutomationRule,
  type TriggerConditions,
  type ActionConfig,
  type AutomationEvent,
  type EventPayload,
  type AutomationResult,
} from './automation-engine';

// Issue Lifecycle Hooks
export {
  onIssueCreated,
  onIssueUpdated,
  invalidateIssueCache,
  preGenerateEmbeddings,
  quickTriageType,
  quickDuplicateCheck,
  type IssueCreatedPayload,
  type IssueUpdatedPayload,
  type OnIssueCreatedResult,
  type OnIssueUpdatedResult,
  type AutomationContext,
} from './issue-hooks';
