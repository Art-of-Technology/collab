/**
 * Note Templates Library
 *
 * Provides built-in templates and utilities for note templates.
 */

import { NoteType, NoteScope } from '@prisma/client';

export interface BuiltInTemplate {
  name: string;
  description: string;
  icon: string;
  titleTemplate: string;
  contentTemplate: string;
  defaultType: NoteType;
  defaultScope: NoteScope;
  defaultTags: string[];
  order: number;
}

/**
 * Placeholder patterns supported in templates:
 * - {{date}} - Current date (e.g., "January 15, 2026")
 * - {{time}} - Current time (e.g., "2:30 PM")
 * - {{datetime}} - Current date and time
 * - {{projectName}} - Name of the selected project
 * - {{number}} - Auto-incrementing number (for ADRs, etc.)
 * - {{title}} - User-provided title
 * - {{userName}} - Current user's name
 * - {{workspaceName}} - Current workspace name
 */
export const TEMPLATE_PLACEHOLDERS = [
  { key: 'date', label: 'Current Date', example: 'January 15, 2026' },
  { key: 'time', label: 'Current Time', example: '2:30 PM' },
  { key: 'datetime', label: 'Date & Time', example: 'January 15, 2026, 2:30 PM' },
  { key: 'projectName', label: 'Project Name', example: 'My Project' },
  { key: 'number', label: 'Auto Number', example: '001' },
  { key: 'title', label: 'Custom Title', example: 'My Title', requiresInput: true },
  { key: 'userName', label: 'Your Name', example: 'John Doe' },
  { key: 'workspaceName', label: 'Workspace Name', example: 'My Workspace' },
] as const;

export type PlaceholderKey = typeof TEMPLATE_PLACEHOLDERS[number]['key'];

/**
 * Built-in templates shipped with the application
 */
export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  {
    name: 'System Prompt',
    description: 'AI system prompt for workspace or project context',
    icon: 'Bot',
    titleTemplate: '{{projectName}} System Prompt',
    contentTemplate: `<h2>Context</h2>
<p>You are an AI assistant helping with the {{projectName}} project.</p>

<h2>Project Overview</h2>
<p>[Describe what this project does and its main purpose]</p>

<h2>Tech Stack</h2>
<ul>
<li>[List key technologies used]</li>
</ul>

<h2>Coding Guidelines</h2>
<ul>
<li>[List important coding conventions]</li>
</ul>

<h2>Important Rules</h2>
<ol>
<li>[Rule 1: e.g., "Always use TypeScript strict mode"]</li>
<li>[Rule 2: e.g., "Follow existing patterns in the codebase"]</li>
<li>[Rule 3: e.g., "Write tests for new features"]</li>
</ol>

<h2>Key Files & Directories</h2>
<ul>
<li><code>src/</code> - [Description]</li>
<li><code>lib/</code> - [Description]</li>
</ul>`,
    defaultType: NoteType.SYSTEM_PROMPT,
    defaultScope: NoteScope.WORKSPACE,
    defaultTags: ['ai', 'context'],
    order: 1,
  },
  {
    name: 'Architecture Decision Record',
    description: 'Document architectural decisions with context and consequences',
    icon: 'Scale',
    titleTemplate: 'ADR-{{number}}: {{title}}',
    contentTemplate: `<h2>Status</h2>
<p><strong>Proposed</strong> | Accepted | Deprecated | Superseded</p>

<h2>Context</h2>
<p>[Describe the issue motivating this decision, and any context that influences or constrains the decision.]</p>

<h2>Decision</h2>
<p>[Describe the response to these forces, stating the design decision that was made.]</p>

<h2>Alternatives Considered</h2>
<h3>Option 1: [Name]</h3>
<ul>
<li><strong>Pros:</strong> [List advantages]</li>
<li><strong>Cons:</strong> [List disadvantages]</li>
</ul>

<h3>Option 2: [Name]</h3>
<ul>
<li><strong>Pros:</strong> [List advantages]</li>
<li><strong>Cons:</strong> [List disadvantages]</li>
</ul>

<h2>Consequences</h2>
<p>[Describe the resulting context, after applying the decision. All consequences should be listed here, not just the "positive" ones.]</p>

<h2>Related Decisions</h2>
<ul>
<li>[Link to related ADRs if any]</li>
</ul>`,
    defaultType: NoteType.DECISION,
    defaultScope: NoteScope.WORKSPACE,
    defaultTags: ['adr', 'architecture', 'decision'],
    order: 2,
  },
  {
    name: 'Meeting Notes',
    description: 'Capture meeting discussions, decisions, and action items',
    icon: 'Users',
    titleTemplate: 'Meeting: {{title}} - {{date}}',
    contentTemplate: `<h2>Meeting Details</h2>
<ul>
<li><strong>Date:</strong> {{date}}</li>
<li><strong>Time:</strong> {{time}}</li>
<li><strong>Attendees:</strong> [List attendees]</li>
<li><strong>Type:</strong> [Standup / Planning / Retrospective / Other]</li>
</ul>

<h2>Agenda</h2>
<ol>
<li>[Topic 1]</li>
<li>[Topic 2]</li>
<li>[Topic 3]</li>
</ol>

<h2>Discussion Notes</h2>
<h3>Topic 1</h3>
<p>[Key points discussed]</p>

<h3>Topic 2</h3>
<p>[Key points discussed]</p>

<h2>Decisions Made</h2>
<ul>
<li>[Decision 1]</li>
<li>[Decision 2]</li>
</ul>

<h2>Action Items</h2>
<table>
<tr><th>Action</th><th>Owner</th><th>Due Date</th></tr>
<tr><td>[Action item]</td><td>[Name]</td><td>[Date]</td></tr>
<tr><td>[Action item]</td><td>[Name]</td><td>[Date]</td></tr>
</table>

<h2>Next Meeting</h2>
<p>[Date and topics for next meeting]</p>`,
    defaultType: NoteType.MEETING,
    defaultScope: NoteScope.WORKSPACE,
    defaultTags: ['meeting'],
    order: 3,
  },
  {
    name: 'README',
    description: 'Project or workspace documentation overview',
    icon: 'FileText',
    titleTemplate: '{{projectName}} README',
    contentTemplate: `<h1>{{projectName}}</h1>

<p>[Brief description of what this project does]</p>

<h2>Getting Started</h2>

<h3>Prerequisites</h3>
<ul>
<li>[Requirement 1]</li>
<li>[Requirement 2]</li>
</ul>

<h3>Installation</h3>
<pre><code># Clone the repository
git clone [url]

# Install dependencies
npm install

# Start development server
npm run dev</code></pre>

<h2>Project Structure</h2>
<pre><code>├── src/
│   ├── components/    # UI components
│   ├── lib/           # Utility functions
│   └── app/           # Application routes
├── public/            # Static assets
└── tests/             # Test files</code></pre>

<h2>Usage</h2>
<p>[Explain how to use the project]</p>

<h2>Configuration</h2>
<p>[List any configuration options]</p>

<h2>Contributing</h2>
<p>[Guidelines for contributing]</p>

<h2>License</h2>
<p>[License information]</p>`,
    defaultType: NoteType.README,
    defaultScope: NoteScope.WORKSPACE,
    defaultTags: ['readme', 'documentation'],
    order: 4,
  },
  {
    name: 'Troubleshooting Guide',
    description: 'Document common issues and their solutions',
    icon: 'AlertTriangle',
    titleTemplate: 'Troubleshooting: {{title}}',
    contentTemplate: `<h2>Overview</h2>
<p>[Brief description of the system/feature this troubleshooting guide covers]</p>

<h2>Common Issues</h2>

<h3>Issue 1: [Problem Title]</h3>
<p><strong>Symptoms:</strong></p>
<ul>
<li>[What the user sees]</li>
<li>[Error messages]</li>
</ul>

<p><strong>Cause:</strong></p>
<p>[Why this happens]</p>

<p><strong>Solution:</strong></p>
<ol>
<li>[Step 1]</li>
<li>[Step 2]</li>
<li>[Step 3]</li>
</ol>

<hr />

<h3>Issue 2: [Problem Title]</h3>
<p><strong>Symptoms:</strong></p>
<ul>
<li>[What the user sees]</li>
</ul>

<p><strong>Cause:</strong></p>
<p>[Why this happens]</p>

<p><strong>Solution:</strong></p>
<ol>
<li>[Step 1]</li>
<li>[Step 2]</li>
</ol>

<h2>Debugging Tips</h2>
<ul>
<li>[Tip 1: How to enable debug mode]</li>
<li>[Tip 2: Where to find logs]</li>
<li>[Tip 3: Common debugging commands]</li>
</ul>

<h2>Getting Help</h2>
<p>[Where to get additional help - Slack channel, documentation links, etc.]</p>`,
    defaultType: NoteType.TROUBLESHOOT,
    defaultScope: NoteScope.WORKSPACE,
    defaultTags: ['troubleshooting', 'debugging'],
    order: 5,
  },
  {
    name: 'How-To Guide',
    description: 'Step-by-step instructions for completing a task',
    icon: 'BookOpen',
    titleTemplate: 'How to {{title}}',
    contentTemplate: `<h2>Overview</h2>
<p>[Brief description of what this guide helps you accomplish]</p>

<h2>Prerequisites</h2>
<ul>
<li>[What you need before starting]</li>
<li>[Required permissions or access]</li>
<li>[Related knowledge or skills]</li>
</ul>

<h2>Steps</h2>

<h3>Step 1: [Action Title]</h3>
<p>[Detailed instructions for this step]</p>
<pre><code># Example command or code</code></pre>

<h3>Step 2: [Action Title]</h3>
<p>[Detailed instructions for this step]</p>

<h3>Step 3: [Action Title]</h3>
<p>[Detailed instructions for this step]</p>

<h3>Step 4: [Action Title]</h3>
<p>[Detailed instructions for this step]</p>

<h2>Verification</h2>
<p>[How to verify the task was completed successfully]</p>

<h2>Common Issues</h2>
<ul>
<li><strong>Problem:</strong> [Issue] → <strong>Solution:</strong> [Fix]</li>
<li><strong>Problem:</strong> [Issue] → <strong>Solution:</strong> [Fix]</li>
</ul>

<h2>Related Guides</h2>
<ul>
<li>[Link to related guide 1]</li>
<li>[Link to related guide 2]</li>
</ul>`,
    defaultType: NoteType.GUIDE,
    defaultScope: NoteScope.WORKSPACE,
    defaultTags: ['guide', 'how-to'],
    order: 6,
  },
  {
    name: 'Runbook',
    description: 'Operational procedures for common tasks',
    icon: 'ScrollText',
    titleTemplate: 'Runbook: {{title}}',
    contentTemplate: `<h2>Runbook Information</h2>
<ul>
<li><strong>Last Updated:</strong> {{date}}</li>
<li><strong>Author:</strong> {{userName}}</li>
<li><strong>Severity:</strong> [Low / Medium / High / Critical]</li>
<li><strong>On-Call Required:</strong> [Yes / No]</li>
</ul>

<h2>Overview</h2>
<p>[Brief description of what this runbook covers and when to use it]</p>

<h2>Prerequisites</h2>
<ul>
<li>[Required access or permissions]</li>
<li>[Required tools]</li>
<li>[Required knowledge]</li>
</ul>

<h2>Procedure</h2>

<h3>1. Initial Assessment</h3>
<ol>
<li>[Check step 1]</li>
<li>[Check step 2]</li>
</ol>

<h3>2. Execution Steps</h3>
<ol>
<li>[Step 1]
   <pre><code># Command to run</code></pre>
</li>
<li>[Step 2]</li>
<li>[Step 3]</li>
</ol>

<h3>3. Verification</h3>
<ol>
<li>[Verification step 1]</li>
<li>[Verification step 2]</li>
</ol>

<h2>Rollback Procedure</h2>
<p>[If something goes wrong, how to revert]</p>
<ol>
<li>[Rollback step 1]</li>
<li>[Rollback step 2]</li>
</ol>

<h2>Escalation</h2>
<p>[When and who to escalate to]</p>
<ul>
<li><strong>Level 1:</strong> [Contact]</li>
<li><strong>Level 2:</strong> [Contact]</li>
</ul>

<h2>Related Resources</h2>
<ul>
<li>[Link to monitoring dashboard]</li>
<li>[Link to related documentation]</li>
</ul>`,
    defaultType: NoteType.RUNBOOK,
    defaultScope: NoteScope.WORKSPACE,
    defaultTags: ['runbook', 'operations'],
    order: 7,
  },
  {
    name: 'Sprint Retrospective',
    description: 'Team retrospective for continuous improvement',
    icon: 'RotateCcw',
    titleTemplate: 'Sprint Retrospective - {{date}}',
    contentTemplate: `<h2>Sprint Information</h2>
<ul>
<li><strong>Sprint:</strong> [Sprint Name/Number]</li>
<li><strong>Date:</strong> {{date}}</li>
<li><strong>Team:</strong> [Team Name]</li>
<li><strong>Facilitator:</strong> {{userName}}</li>
</ul>

<h2>Sprint Goals Review</h2>
<table>
<tr><th>Goal</th><th>Status</th><th>Notes</th></tr>
<tr><td>[Goal 1]</td><td>[Met / Partially Met / Not Met]</td><td>[Notes]</td></tr>
<tr><td>[Goal 2]</td><td>[Met / Partially Met / Not Met]</td><td>[Notes]</td></tr>
</table>

<h2>What Went Well</h2>
<ul>
<li>[Positive point 1]</li>
<li>[Positive point 2]</li>
<li>[Positive point 3]</li>
</ul>

<h2>What Could Be Improved</h2>
<ul>
<li>[Improvement area 1]</li>
<li>[Improvement area 2]</li>
<li>[Improvement area 3]</li>
</ul>

<h2>What We Learned</h2>
<ul>
<li>[Learning 1]</li>
<li>[Learning 2]</li>
</ul>

<h2>Action Items</h2>
<table>
<tr><th>Action</th><th>Owner</th><th>Priority</th><th>Due</th></tr>
<tr><td>[Action 1]</td><td>[Name]</td><td>[High/Med/Low]</td><td>[Date]</td></tr>
<tr><td>[Action 2]</td><td>[Name]</td><td>[High/Med/Low]</td><td>[Date]</td></tr>
</table>

<h2>Team Morale</h2>
<p>[Overall sentiment and any concerns to address]</p>

<h2>Shoutouts</h2>
<ul>
<li>[Person] - [Reason for recognition]</li>
</ul>`,
    defaultType: NoteType.MEETING,
    defaultScope: NoteScope.WORKSPACE,
    defaultTags: ['retrospective', 'sprint', 'team'],
    order: 8,
  },
  {
    name: 'Use Case Specification',
    description: 'One use case in full: who, when, the normal path and what can go differently',
    icon: 'Workflow',
    titleTemplate: 'Use case: {{title}}',
    contentTemplate: `<h2>Scope and level</h2>
<p>[The system or part of it this covers, and whether this is a user goal or a smaller step within one.]</p>

<h2>Primary actor</h2>
<p>[Who or what starts this and wants the outcome.]</p>

<h2>Stakeholders and interests</h2>
<ul>
<li>[Stakeholder] - [What they need from this]</li>
</ul>

<h2>Preconditions</h2>
<ul>
<li>[What must already be true before it starts]</li>
</ul>

<h2>Trigger</h2>
<p>[The event that starts it.]</p>

<h2>Main success scenario</h2>
<ol>
<li>[Step 1]</li>
<li>[Step 2]</li>
<li>[Step 3]</li>
</ol>

<h2>Extensions</h2>
<ul>
<li>[Step number and condition] - [What happens instead]</li>
</ul>

<h2>Postconditions</h2>
<ul>
<li>[What is true when it ends well]</li>
<li>[What is guaranteed even when it fails]</li>
</ul>

<h2>Open questions</h2>
<ul>
<li>[Question] - [Who can answer it]</li>
</ul>`,
    defaultType: NoteType.GENERAL,
    defaultScope: NoteScope.WORKSPACE,
    defaultTags: ['use-case', 'requirements'],
    order: 9,
  },
  {
    name: 'Product Requirements',
    description: 'What to build and why, before deciding how',
    icon: 'ClipboardList',
    titleTemplate: 'PRD: {{title}}',
    contentTemplate: `<h2>Problem</h2>
<p>[What is wrong or missing today, for whom, and how you know.]</p>

<h2>Goals</h2>
<ul>
<li>[Outcome 1]</li>
</ul>

<h2>Non-goals</h2>
<ul>
<li>[What this deliberately leaves out]</li>
</ul>

<h2>Users</h2>
<p>[Who will use it and in what situation.]</p>

<h2>Requirements</h2>
<table>
<tr><th>Requirement</th><th>Priority</th><th>Notes</th></tr>
<tr><td>[What the product must do]</td><td>[Must/Should/Could]</td><td>[Detail or constraint]</td></tr>
</table>

<h2>Success measures</h2>
<ul>
<li>[Measure] - [Target and when it is checked]</li>
</ul>

<h2>Risks</h2>
<ul>
<li>[Risk] - [How it is reduced]</li>
</ul>

<h2>Open questions</h2>
<ul>
<li>[Question] - [Who can answer it]</li>
</ul>`,
    defaultType: NoteType.GENERAL,
    defaultScope: NoteScope.WORKSPACE,
    defaultTags: ['prd', 'requirements', 'product'],
    order: 10,
  },
  {
    name: 'Test Plan',
    description: 'What will be tested, how, and when testing is done',
    icon: 'FlaskConical',
    titleTemplate: 'Test plan: {{title}}',
    contentTemplate: `<h2>Scope</h2>
<p>[The features, changes or release this plan covers.]</p>

<h2>Not tested</h2>
<ul>
<li>[What is left out] - [Why]</li>
</ul>

<h2>Approach</h2>
<p>[The kinds of testing used and what each one is for: automated, manual, exploratory, load.]</p>

<h2>Environments and data</h2>
<ul>
<li>[Environment] - [Data and accounts it needs]</li>
</ul>

<h2>Entry criteria</h2>
<ul>
<li>[What must be true before testing starts]</li>
</ul>

<h2>Exit criteria</h2>
<ul>
<li>[What must be true to call testing done]</li>
</ul>

<h2>Risks</h2>
<ul>
<li>[Risk] - [What is done about it]</li>
</ul>`,
    defaultType: NoteType.GENERAL,
    defaultScope: NoteScope.WORKSPACE,
    defaultTags: ['test-plan', 'quality'],
    order: 11,
  },
  {
    name: 'Incident Review',
    description: 'Blameless review of an incident: what happened, why, and what changes',
    icon: 'Siren',
    titleTemplate: 'Incident review: {{title}} ({{date}})',
    contentTemplate: `<p><em>This review is blameless. It describes what the system and the process allowed, not who did it.</em></p>

<h2>Summary</h2>
<p>[What happened, in two or three sentences.]</p>

<h2>Impact</h2>
<ul>
<li><strong>Who was affected:</strong> [Users, customers, teams]</li>
<li><strong>How long:</strong> [Start and end, with time zone]</li>
<li><strong>What they saw:</strong> [Errors, slowness, lost data]</li>
</ul>

<h2>Timeline</h2>
<table>
<tr><th>Time</th><th>Event</th></tr>
<tr><td>[HH:MM]</td><td>[What happened or what was done]</td></tr>
</table>

<h2>Root cause</h2>
<p>[The chain of causes, down to the one that can be changed.]</p>

<h2>What went well</h2>
<ul>
<li>[What helped detect or limit it]</li>
</ul>

<h2>What went badly</h2>
<ul>
<li>[What delayed detection or recovery]</li>
</ul>

<h2>Follow-up actions</h2>
<table>
<tr><th>Action</th><th>Owner</th><th>Due</th></tr>
<tr><td>[Action 1]</td><td>[Name]</td><td>[Date]</td></tr>
</table>`,
    defaultType: NoteType.TROUBLESHOOT,
    defaultScope: NoteScope.WORKSPACE,
    defaultTags: ['incident', 'postmortem'],
    order: 12,
  },
];

/**
 * Get all built-in templates
 */
export function getBuiltInTemplates(): BuiltInTemplate[] {
  return BUILT_IN_TEMPLATES;
}

/**
 * Get a built-in template by name
 */
export function getBuiltInTemplateByName(name: string): BuiltInTemplate | undefined {
  return BUILT_IN_TEMPLATES.find(t => t.name === name);
}

/**
 * Get templates by note type
 */
export function getTemplatesByType(type: NoteType): BuiltInTemplate[] {
  return BUILT_IN_TEMPLATES.filter(t => t.defaultType === type);
}
