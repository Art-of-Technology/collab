# Collab AI-Native Integration Guide

This document provides comprehensive documentation for Collab's AI-Native features, covering all five phases of the transformation.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Phase 1: AI Orchestration Foundation](#phase-1-ai-orchestration-foundation)
4. [Phase 2: Smart Automation](#phase-2-smart-automation)
5. [Phase 3: Natural Language Interface](#phase-3-natural-language-interface)
6. [Phase 4: AI Teammates](#phase-4-ai-teammates)
7. [Phase 5: Content Generation](#phase-5-content-generation)
8. [API Reference](#api-reference)
9. [Configuration](#configuration)
10. [Best Practices](#best-practices)

---

## Overview

Collab has been transformed into a fully AI-Native project management platform with:

- **Multi-Provider AI Support**: Anthropic Claude (primary) + OpenAI (embeddings)
- **Named AI Personas**: 5 specialized agents that appear as team members
- **Smart Automation**: Auto-triage, duplicate detection, intelligent assignment
- **Natural Language Interface**: Chat sidebar + Command palette (Cmd+K)
- **AI Teammates**: Scheduled tasks, daily standups, sprint monitoring
- **Content Generation**: Release notes, specs, test cases

### AI Agents

| Agent | Role | Specialization |
|-------|------|----------------|
| Alex | Assistant | General help, task coordination |
| Scout | Analyst | Data analysis, metrics, reports |
| Rex | Reviewer | Code review, quality assurance |
| Sage | Planner | Sprint planning, specs, estimates |
| Quinn | Writer | Documentation, release notes |

---

## Architecture

```
src/lib/ai/
├── core/
│   ├── types.ts          # Type definitions
│   ├── provider.ts       # Provider abstraction
│   └── orchestrator.ts   # Central AI coordinator
├── providers/
│   ├── anthropic.ts      # Claude integration
│   └── openai.ts         # OpenAI integration
├── agents/
│   ├── agent-registry.ts # Named AI personas
│   ├── scheduler.ts      # Background task scheduler
│   ├── daily-standup.ts  # Standup generation
│   └── sprint-health.ts  # Sprint monitoring
├── automation/
│   ├── auto-triage.ts    # Issue classification
│   ├── duplicate-detection.ts
│   ├── auto-assign.ts    # Smart assignment
│   ├── automation-engine.ts
│   └── issue-hooks.ts    # Lifecycle hooks
├── content/
│   ├── release-notes.ts  # Release notes generator
│   └── spec-generator.ts # Specs & test cases
└── index.ts              # Main exports
```

---

## Phase 1: AI Orchestration Foundation

### Quick Start

```typescript
import { aiComplete, aiClassify, aiSummarize, aiEmbed } from '@/lib/ai';

// Simple completion
const response = await aiComplete('Explain microservices architecture');

// Classification
const category = await aiClassify(
  'Login button not working on mobile',
  ['BUG', 'FEATURE', 'TASK', 'QUESTION']
);

// Summarization
const summary = await aiSummarize(longText, { style: 'bullet_points' });

// Embeddings
const vectors = await aiEmbed(['text 1', 'text 2']);
```

### Using the Orchestrator

```typescript
import { getAIOrchestrator } from '@/lib/ai';

const orchestrator = getAIOrchestrator();

// Completion with options
const response = await orchestrator.complete({
  messages: [{ role: 'user', content: 'Help me write a user story' }],
  systemPrompt: 'You are a product manager assistant',
  model: 'claude-sonnet-4',
  maxTokens: 1000,
});

// Streaming
for await (const chunk of orchestrator.stream(request)) {
  process.stdout.write(chunk.content);
}

// Chat with context
const chatResponse = await orchestrator.chat(
  sessionId,
  'What are the priorities for this sprint?',
  { projectId, workspaceId }
);
```

### Working with Agents

```typescript
import { getAgentRegistry, getBestAgent, getAgent } from '@/lib/ai';

// Get best agent for a task
const agent = getBestAgent('analyze sprint velocity');
// Returns: Scout (analyst)

// Get specific agent
const sage = getAgent('sage');

// Use agent's system prompt
const response = await orchestrator.complete({
  messages: [{ role: 'user', content: 'Create a sprint plan' }],
  systemPrompt: sage.systemPrompt,
});
```

---

## Phase 2: Smart Automation

### Auto-Triage

```typescript
import { getAutoTriageService } from '@/lib/ai/automation';

const triageService = getAutoTriageService();

const suggestion = await triageService.analyzeIssue({
  title: 'Users cannot login after password reset',
  description: 'Multiple users reporting this issue...',
  projectContext: {
    name: 'Auth Service',
    existingLabels: ['auth', 'login', 'password', 'security'],
  },
});

// Returns:
// {
//   type: { value: 'BUG', confidence: 0.95 },
//   priority: { value: 'HIGH', confidence: 0.88 },
//   labels: [{ value: 'auth', confidence: 0.92 }, { value: 'login', confidence: 0.85 }],
//   storyPoints: { value: 3, confidence: 0.7 },
// }
```

### Duplicate Detection

```typescript
import { getDuplicateDetectionService } from '@/lib/ai/automation';

const duplicateService = getDuplicateDetectionService();

const result = await duplicateService.findDuplicates(
  { title: 'Login page not loading', description: '...' },
  existingIssues,
  { maxCandidates: 5, threshold: 0.75 }
);

// Returns candidates with similarity scores
```

### Auto-Assign

```typescript
import { getAutoAssignService } from '@/lib/ai/automation';

const assignService = getAutoAssignService();

const suggestions = await assignService.suggestAssignees(
  issue,
  teamMembers,
  { maxSuggestions: 3 }
);
```

### Issue Lifecycle Hooks

```typescript
import { onIssueCreated, onIssueUpdated } from '@/lib/ai/automation';

// In your issue creation handler
const aiResults = await onIssueCreated(newIssue, {
  workspaceId,
  projectId,
  existingIssues: await getProjectIssues(projectId),
  existingLabels: await getProjectLabels(projectId),
  automationRules: await getAutomationRules(workspaceId),
});

if (aiResults.triageSuggestions) {
  // Show suggestions to user or auto-apply
}

if (aiResults.duplicateCheck?.candidates.length > 0) {
  // Warn user about potential duplicates
}
```

---

## Phase 3: Natural Language Interface

### AI Chat Sidebar

```tsx
import { AIChatSidebar } from '@/components/ai';

<AIChatSidebar
  workspaceId={workspaceId}
  projectId={projectId}
  issueId={issueId}
  context={{
    workspaceName: 'Acme Corp',
    projectName: 'Auth Service',
    issueName: 'Login Bug',
    currentView: 'issue_detail',
  }}
/>
```

### Command Palette (Cmd+K)

```tsx
import { AICommandPalette } from '@/components/ai';

<AICommandPalette
  workspaceId={workspaceId}
  workspaceSlug={workspaceSlug}
  projectId={projectId}
  onCreateIssue={(type) => openCreateIssueModal(type)}
  onNavigate={(path) => router.push(path)}
/>
```

### Contextual AI Actions

```tsx
import { AIContextMenu, AIQuickActions, AIInlineAssist } from '@/components/ai';

// Context menu for issues
<AIContextMenu
  workspaceId={workspaceId}
  context={{
    type: 'issue',
    id: issue.id,
    title: issue.title,
    description: issue.description,
    projectId: issue.projectId,
  }}
  onAction={(action, result) => handleAIAction(action, result)}
/>

// Quick actions for text editing
<AIQuickActions
  workspaceId={workspaceId}
  context={{
    type: 'editor',
    content: editorContent,
    onContentUpdate: setEditorContent,
  }}
  variant="floating"
/>

// Inline AI assistance
<AIInlineAssist
  workspaceId={workspaceId}
  value={description}
  onChange={setDescription}
  placeholder="Ask AI to improve..."
/>
```

### Specialized Components

```tsx
import {
  AITriageBadge,
  AIDuplicateWarning,
  AIAssigneeSuggestion
} from '@/components/ai';

// Auto-triage badge
<AITriageBadge
  workspaceId={workspaceId}
  issue={issue}
  existingLabels={projectLabels}
  onApply={(field, value) => updateIssue(field, value)}
  autoFetch={true}
/>

// Duplicate warning
<AIDuplicateWarning
  workspaceId={workspaceId}
  projectId={projectId}
  title={issueTitle}
  description={issueDescription}
  onLink={(issueId) => linkAsDuplicate(issueId)}
  autoCheck={true}
/>

// Assignee suggestions
<AIAssigneeSuggestion
  workspaceId={workspaceId}
  projectId={projectId}
  issue={issue}
  onAssign={(memberId) => assignToMember(memberId)}
/>
```

---

## Phase 4: AI Teammates

### Task Scheduler

```typescript
import { getScheduler, TASK_TYPES } from '@/lib/ai';

const scheduler = getScheduler();

// Schedule daily standup
scheduler.scheduleTask({
  id: 'daily-standup-project-1',
  name: 'Daily Standup',
  description: 'Generate daily standup summary',
  agentId: 'sage',
  taskType: TASK_TYPES.DAILY_STANDUP,
  schedule: {
    frequency: 'daily',
    time: '09:00',
    timezone: 'America/New_York',
  },
  input: {
    notifyChannel: '#dev-team',
  },
  workspaceId,
  projectId,
  enabled: true,
  priority: 'medium',
});

// Schedule weekly sprint health check
scheduler.scheduleTask({
  id: 'sprint-health-project-1',
  name: 'Sprint Health Check',
  agentId: 'scout',
  taskType: TASK_TYPES.SPRINT_HEALTH_CHECK,
  schedule: {
    frequency: 'daily',
    time: '17:00',
  },
  input: { sprintId },
  workspaceId,
  projectId,
  enabled: true,
  priority: 'high',
});

// Start the scheduler
scheduler.start();

// Execute task immediately
const execution = await scheduler.executeNow('daily-standup-project-1');
```

### Daily Standup Generator

```typescript
import { getStandupGenerator } from '@/lib/ai';

const generator = getStandupGenerator();

// Quick standup from issues
const quickSummary = await generator.generateQuickStandup(recentIssues, workspaceId);

// Full standup with context
const standup = await generator.generateStandup({
  workspaceId,
  projectId,
  teamMembers,
  recentIssues,
  recentComments,
  sprintInfo: {
    id: sprint.id,
    name: sprint.name,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    totalPoints: 50,
    completedPoints: 35,
    issueCount: 20,
    completedCount: 14,
  },
});

console.log(standup.fullSummary);
console.log(standup.sections.accomplished);
console.log(standup.sections.blockers);
```

### Sprint Health Monitoring

```typescript
import { getSprintHealthMonitor } from '@/lib/ai';

const monitor = getSprintHealthMonitor();

// Quick health check
const { health, score, topRisks } = monitor.quickHealthCheck(sprintData);

// Full health report
const report = await monitor.analyzeSprintHealth(sprintData);

console.log(report.overallHealth); // 'healthy' | 'at_risk' | 'critical'
console.log(report.healthScore); // 0-100
console.log(report.risks); // Identified risks
console.log(report.recommendations); // AI recommendations
console.log(report.burndownAnalysis.trend); // 'ahead' | 'on_track' | 'behind'
```

---

## Phase 5: Content Generation

### Release Notes

```typescript
import { getReleaseNotesGenerator } from '@/lib/ai/content';

const generator = getReleaseNotesGenerator({
  format: 'markdown',
  style: 'user-friendly',
  includeContributors: true,
});

const notes = await generator.generateReleaseNotes({
  version: '2.1.0',
  releaseName: 'Aurora',
  releaseDate: new Date(),
  issues: completedIssues,
  pullRequests: mergedPRs,
  contributors,
  breakingChanges: ['API endpoint renamed'],
});

// Generate changelog
const changelog = await generator.generateChangelog(releaseData);

// Generate for Slack
const slackMessage = await generator.generateForFormat(releaseData, 'slack');
```

### Specs & Test Cases

```typescript
import { getSpecGenerator } from '@/lib/ai/content';

const generator = getSpecGenerator({
  specDetail: 'detailed',
  testDetail: 'comprehensive',
  includeCodeSnippets: true,
  targetFramework: 'jest',
  targetLanguage: 'typescript',
});

// Generate technical specification
const spec = await generator.generateSpec(issue, projectContext);

console.log(spec.summary);
console.log(spec.functionalRequirements);
console.log(spec.technicalApproach);
console.log(spec.acceptanceCriteria);

// Generate test cases
const tests = await generator.generateTests(issue, spec, projectContext);

console.log(tests.unitTests);
console.log(tests.integrationTests);
console.log(tests.e2eTests);

// Quick acceptance criteria
const criteria = await generator.generateAcceptanceCriteria(issue);

// Effort estimation
const estimate = await generator.estimateEffort(issue);
```

---

## API Reference

### Chat API

```
POST /api/ai/chat
Content-Type: application/json

{
  "message": "What issues are blocking the release?",
  "sessionId": "session-123",
  "workspaceId": "ws-456",
  "projectId": "proj-789",
  "agentName": "Scout",
  "context": {
    "currentView": "sprint_board"
  }
}
```

### Completion API

```
POST /api/ai/complete
Content-Type: application/json

{
  "type": "improve" | "summarize" | "shorten" | "custom",
  "input": "Text to process",
  "options": {
    "systemPrompt": "Custom system prompt",
    "model": "claude-sonnet-4",
    "maxTokens": 1000
  }
}
```

### Automation APIs

```
POST /api/ai/automation/triage
POST /api/ai/automation/duplicates
POST /api/ai/automation/assign
```

### Agent APIs

```
POST /api/ai/agents/standup
POST /api/ai/agents/sprint-health
```

### Content APIs

```
POST /api/ai/content/release-notes
POST /api/ai/content/spec
```

---

## Configuration

### Environment Variables

```env
# Required
ANTHROPIC_API_KEY=sk-ant-...

# Optional (for embeddings)
OPENAI_API_KEY=sk-...

# Optional customization
AI_DEFAULT_MODEL=claude-sonnet-4
AI_MAX_RETRIES=3
AI_TIMEOUT_MS=60000
```

### Provider Configuration

```typescript
import { getAIOrchestrator } from '@/lib/ai';

const orchestrator = getAIOrchestrator({
  defaultProvider: 'anthropic',
  defaultModel: 'claude-sonnet-4',
  fallbackProvider: 'openai',
  maxRetries: 3,
  contextWindow: 100000,
});
```

---

## Best Practices

### 1. Use the Right Agent

```typescript
// Use Scout for data analysis
const analysisResult = await orchestrator.complete({
  messages: [{ role: 'user', content: 'Analyze velocity trends' }],
  systemPrompt: getAgent('scout').systemPrompt,
});

// Use Quinn for documentation
const docs = await orchestrator.complete({
  messages: [{ role: 'user', content: 'Write API documentation' }],
  systemPrompt: getAgent('quinn').systemPrompt,
});
```

### 2. Handle Errors Gracefully

```typescript
import { AIError } from '@/lib/ai';

try {
  const result = await aiComplete(prompt);
} catch (error) {
  if (error instanceof AIError) {
    if (error.code === 'RATE_LIMIT' && error.retryable) {
      // Retry with backoff
    } else if (error.code === 'CONTEXT_LENGTH_EXCEEDED') {
      // Truncate input and retry
    }
  }
}
```

### 3. Use Streaming for Long Responses

```typescript
const stream = orchestrator.stream(request);
for await (const chunk of stream) {
  updateUI(chunk.content);
}
```

### 4. Cache Embeddings

```typescript
import { getDuplicateDetectionService } from '@/lib/ai/automation';

const service = getDuplicateDetectionService();

// Pre-generate embeddings for existing issues
await service.generateAndCacheEmbedding(issue);

// Invalidate when content changes
service.invalidateCache(issueId);
```

### 5. Batch Operations

```typescript
// Generate embeddings in batch
const embeddings = await aiEmbed([text1, text2, text3, text4, text5]);
```

---

## Database Schema

The AI-Native transformation includes these new database tables:

- `AIAgent` - Custom and default AI agents
- `AIAgentConfig` - Workspace-specific agent configuration
- `AIConversation` - Chat session management
- `AIMessage` - Conversation history
- `AITask` - Task execution tracking
- `IssueEmbedding` - Cached issue embeddings
- `NoteEmbedding` - Cached note embeddings
- `AIAutomationRule` - Automation rule definitions
- `AIAutomationRun` - Automation execution logs

See `prisma/migrations/20260123_ai_native_foundation/migration.sql` for the complete schema.

---

## Support

For issues or questions about the AI-Native features:
1. Check the API reference above
2. Review error messages for specific guidance
3. Contact the platform team

---

*Generated by Quinn, Collab's Technical Writer AI*
