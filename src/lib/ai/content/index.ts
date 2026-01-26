/**
 * AI Content Generation Module
 *
 * Exports for all AI-powered content generation services.
 */

export {
  ReleaseNotesGenerator,
  getReleaseNotesGenerator,
  type ReleaseData,
  type ReleaseIssue,
  type PullRequest,
  type ReleaseNotes,
  type ReleaseNoteItem,
  type ReleaseNotesOptions,
  type ReleaseNoteFormat,
  type ReleaseNoteStyle,
} from './release-notes';

export {
  SpecGenerator,
  getSpecGenerator,
  type IssueInput,
  type ProjectContext,
  type TechnicalSpec,
  type Requirement,
  type ComponentSpec,
  type AcceptanceCriterion,
  type EdgeCase,
  type EffortEstimate,
  type Risk,
  type TestSuite,
  type TestCase,
  type TestStep,
  type TestDataSpec,
  type MockSpec,
  type SpecGeneratorOptions,
} from './spec-generator';
