# AI-Native Platform Transformation Plan

## Executive Summary

This document outlines a comprehensive plan to transform Collab into an AI-Native platform with seamless Claude Code integration via MCP. The goal is to create a modern, intuitive experience where AI assistance is deeply integrated into every workflow - from onboarding to daily task management.

---

## Part 1: Current State Analysis

### 1.1 Dashboard Issues

**Current Problems:**
- The dashboard (`/dashboard/page.tsx`) displays static metrics without actionable insights
- Content is generic: blockers, ideas, questions, tags, leave management - no personalized AI-driven guidance
- No quick actions or smart suggestions based on user context
- Missing AI-powered summaries of what needs attention

**Current Components:**
```
- TeamMetrics (static stats display)
- TeamActivity (simple activity list)
- UserPosts (user's posts)
- PostsByType (BLOCKER, IDEA, QUESTION)
- PopularTags
- UnansweredPosts
- MyLeave / LeaveRequestsDashboard
```

### 1.2 Navigation/Sidebar Complexity

**Current Problems:**
- Sidebar (`Sidebar.tsx` - 1125 lines) is overly complex
- Multiple sections: Projects, Views, Apps, Workspace Features
- 5+ navigation items in workspace features (Posts, Context, Bookmarks, Tags, Feature Requests)
- No AI quick access or contextual suggestions
- Collapsed mode loses important functionality

**Current Sidebar Structure:**
```
├── Logo + Search + Notifications
├── Workspace Selector
├── Workspace Features
│   ├── Posts
│   ├── Context
│   ├── Bookmarks
│   ├── Tags
│   └── Feature Requests
├── Projects Section (collapsible with search)
├── Views Section (collapsible with search)
├── Apps Section (feature-flagged)
└── User Menu
```

### 1.3 Project Dashboard

**Current State:**
- Well-designed project dashboard (`ProjectDashboard.tsx`)
- Shows views, recent activity, at-risk items, GitHub, feature requests, notes
- Issue links work via `handleIssueClick` but may have routing issues
- No AI integration for insights or suggestions

### 1.4 View System

**Current Strengths:**
- Robust view system with multiple display types (Kanban, List, Table, Calendar, Timeline)
- Rich filtering capabilities
- Real-time updates support
- Custom view creation

**Missing AI Features:**
- No AI-powered view suggestions
- No natural language filtering ("show me overdue bugs assigned to me")
- No AI summaries of view contents

### 1.5 MCP Implementation

**Current State:**
- Solid MCP server with OAuth authentication
- Full CRUD operations for issues, projects, views
- Resource endpoints for reading data
- Guided prompts for workflows

**Integration Gap:**
- No in-app AI chat widget
- MCP designed for external tools (Cursor IDE) not internal use
- No real-time AI assistance within the platform

### 1.6 Design System

**Current State:**
- Uses shadcn/ui components
- Dark theme with zinc color palette (#09090b, #1f1f1f, #27272a)
- Accent colors: Blue (#3b82f6), Green (#22c55e)
- Consistent button variants (default, primary, destructive, outline, ghost)

---

## Part 2: AI-Native Transformation Proposal

### 2.1 Global AI Assistant Widget

**Implementation: Floating AI Command Bar**

Create a persistent, always-accessible AI widget at the bottom of the screen:

```
┌─────────────────────────────────────────────────────────────┐
│  [AI Icon]  Ask anything or type a command...    [⌘K] [↑]  │
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- **Natural Language Commands:** "Create a bug for login not working on Safari"
- **Quick Actions:** "Show my overdue tasks", "What's blocking the team?"
- **Context Awareness:** Understands current page, selected issue, active project
- **Voice Input:** Optional voice command support
- **Command Palette Integration:** Merged with existing ⌘K search
- **Conversation History:** Sliding panel for full chat history
- **Suggested Actions:** AI proactively suggests relevant actions

**Expanded State:**
```
┌─────────────────────────────────────────────────────────────┐
│  AI Assistant                                    [─] [×]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [User] What needs my attention today?                      │
│                                                             │
│  [AI] Here's your morning briefing:                         │
│                                                             │
│  🔴 3 overdue issues need immediate attention               │
│     • MA-142: Payment gateway timeout  [View]               │
│     • MA-156: Mobile nav broken        [View]               │
│     • MA-161: API rate limiting        [View]               │
│                                                             │
│  ⚠️  2 blockers raised by your team                         │
│     • Sarah is blocked on MA-145       [Help]               │
│     • API team needs design specs      [Help]               │
│                                                             │
│  ✅ You completed 5 issues yesterday - great progress!      │
│                                                             │
│  [Quick Actions]                                            │
│  [Triage Overdue] [Help Sarah] [View My Sprint]             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  [AI Icon]  Type a message...               [Voice] [Send]  │
└─────────────────────────────────────────────────────────────┘
```

**Component Location:** `src/components/ai/AIAssistantWidget.tsx`

---

### 2.2 Reimagined Dashboard

**New AI-Powered Dashboard:**

```
┌─────────────────────────────────────────────────────────────┐
│  Good morning, John                                         │
│  Here's what AI thinks you should focus on today            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐          │
│  │  🎯 AI Focus Items  │  │  📊 Sprint Health   │          │
│  │                     │  │                     │          │
│  │  3 Critical         │  │  ████████░░ 78%    │          │
│  │  5 High Priority    │  │  On track for goal  │          │
│  │  [View Focus List]  │  │  [Details]          │          │
│  └─────────────────────┘  └─────────────────────┘          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  💡 AI Insights                                      │   │
│  │                                                      │   │
│  │  • "MA-145 has been in review for 3 days - consider │   │
│  │    following up with Sarah"                         │   │
│  │                                                      │   │
│  │  • "You have 3 meetings today - block focus time?"  │   │
│  │    [Block 2 Hours] [Dismiss]                        │   │
│  │                                                      │   │
│  │  • "The team's velocity dropped 15% this sprint -   │   │
│  │    2 members have high WIP counts"                  │   │
│  │    [View Analysis] [Dismiss]                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌───────────────────────┐  ┌───────────────────────┐      │
│  │  📥 Needs Response    │  │  ⏰ Coming Up         │      │
│  │                       │  │                       │      │
│  │  2 questions for you  │  │  3 due today          │      │
│  │  1 review requested   │  │  5 due this week      │      │
│  │  [Respond Now]        │  │  [View Timeline]      │      │
│  └───────────────────────┘  └───────────────────────┘      │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  🤖 Quick Actions (AI-Powered)                       │   │
│  │                                                      │   │
│  │  [Create Issue] [Start Standup] [Check Blockers]    │   │
│  │  [My Sprint] [Team Overview] [Ask AI Anything]      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**New Dashboard Components:**
```
src/components/dashboard/
├── AIFocusItems.tsx        # AI-prioritized task list
├── SprintHealthCard.tsx    # Visual sprint progress
├── AIInsightsPanel.tsx     # Proactive AI recommendations
├── NeedsResponseCard.tsx   # Items requiring user action
├── QuickActionsBar.tsx     # AI-suggested quick actions
└── PersonalizedGreeting.tsx # Context-aware greeting
```

---

### 2.3 Simplified Navigation

**New Sidebar Structure:**

```
┌──────────────────────────┐
│  [Logo]        [⌘K] [🔔] │
├──────────────────────────┤
│                          │
│  🏠 Home                 │  ← AI-powered dashboard
│  📋 My Work              │  ← Personal issue tracker
│  👥 Team                 │  ← Team overview
│                          │
│  ─────────────────────── │
│                          │
│  PROJECTS                │
│  ▸ Project Alpha    (12) │
│  ▸ Project Beta      (5) │
│  + New Project           │
│                          │
│  ─────────────────────── │
│                          │
│  VIEWS                   │
│  ★ Sprint Board          │
│  ★ My Tasks              │
│  + Create View           │
│                          │
│  ─────────────────────── │
│                          │
│  MORE                    │
│  📝 Context              │
│  🔖 Saved                │
│  🏷️ Tags                 │
│                          │
├──────────────────────────┤
│  [Avatar] John Doe    ⋮  │
└──────────────────────────┘
```

**Key Changes:**
1. **Reduced from 5 to 3 main navigation items** (Home, My Work, Team)
2. **Removed redundant items:** Posts moved to Context, Feature Requests to project-level
3. **Cleaner visual hierarchy** with proper grouping
4. **"More" section** for less-used features (collapsible)
5. **Integrated search and notifications** in header area

---

### 2.4 AI-Enhanced Views

**Natural Language Filtering:**

Add an AI filter bar to all view types:

```
┌─────────────────────────────────────────────────────────────┐
│  Sprint Board                                               │
├─────────────────────────────────────────────────────────────┤
│  [🔍 Type to filter or ask AI...]                          │
│                                                             │
│  Examples:                                                  │
│  • "bugs assigned to me"                                   │
│  • "high priority items due this week"                     │
│  • "show blocked items and their blockers"                 │
│  • "what did Sarah complete yesterday?"                    │
├─────────────────────────────────────────────────────────────┤
```

**AI View Actions:**

```
┌─────────────────────────────────────────────┐
│  [View Options]              [AI Actions ▼] │
│                              ┌──────────────┤
│                              │ 📊 Summarize │
│                              │ 🔄 Prioritize│
│                              │ 📈 Analyze   │
│                              │ 📧 Report    │
│                              └──────────────┘
```

**AI Actions for Views:**
- **Summarize:** Generate a brief summary of view contents
- **Prioritize:** AI-suggested ordering based on urgency/impact
- **Analyze:** Identify patterns, blockers, risks
- **Report:** Generate shareable status report

---

### 2.5 AI-Enhanced Issue Detail

**Add AI sidebar to issue detail:**

```
┌──────────────────────────────────────────────────────────────────┐
│  MA-145: Payment gateway timeout                          [AI 💡] │
├────────────────────────────────────┬─────────────────────────────┤
│                                    │  AI Assistant               │
│  [Issue content...]                │  ─────────────────────────  │
│                                    │                             │
│                                    │  💡 Suggestions:            │
│                                    │                             │
│                                    │  • Similar issue MA-089 was │
│                                    │    fixed by increasing      │
│                                    │    timeout to 30s           │
│                                    │                             │
│                                    │  • Related PR #234 might    │
│                                    │    have introduced this     │
│                                    │                             │
│                                    │  • 3 users reported this    │
│                                    │    in the last week         │
│                                    │                             │
│                                    │  ─────────────────────────  │
│                                    │                             │
│                                    │  [Ask about this issue...]  │
│                                    │                             │
└────────────────────────────────────┴─────────────────────────────┘
```

**AI Issue Features:**
- **Smart Suggestions:** Related issues, potential solutions, relevant PRs
- **Auto-categorization:** Suggest labels, type, priority based on description
- **Impact Analysis:** Estimate blast radius, affected users
- **Resolution Helper:** Generate test cases, reproduction steps
- **Writing Assistant:** Improve descriptions, generate acceptance criteria

---

### 2.6 Issue Link Fix (Bug)

**Current Issue:** Links in ProjectDashboard may not be working correctly.

**Investigation Points:**
- `handleIssueClick` uses `router.push(\`/\${workspaceSlug}/issue/\${issueKey}\`)`
- Route might be `/issues/[issueId]` not `/issue/[issueKey]`
- Need to verify routing consistency

**Fix Required:**
```typescript
// Verify the correct route pattern
// Current: /${workspaceSlug}/issue/${issueKey}
// Should match: src/app/(main)/[workspaceId]/issues/[issueId]/page.tsx
```

---

## Part 3: Design System Updates

### 3.1 New AI Component Tokens

Add to existing design system:

```css
/* AI-specific colors */
--ai-primary: #8b5cf6;      /* Purple for AI elements */
--ai-primary-light: #a78bfa;
--ai-primary-dark: #7c3aed;
--ai-glow: rgba(139, 92, 246, 0.15);
--ai-border: rgba(139, 92, 246, 0.3);

/* AI States */
--ai-thinking: #f59e0b;     /* Amber when processing */
--ai-success: #10b981;      /* Green for successful response */
--ai-error: #ef4444;        /* Red for errors */
```

### 3.2 AI Component Variants

```typescript
// New button variants for AI actions
const aiButtonVariants = {
  "ai-primary":
    "bg-[#8b5cf6]/10 hover:bg-[#8b5cf6]/20 text-[#8b5cf6] border border-[#8b5cf6]/20",
  "ai-ghost":
    "hover:bg-[#8b5cf6]/10 text-[#a1a1aa] hover:text-[#8b5cf6]",
  "ai-suggestion":
    "bg-[#8b5cf6]/5 hover:bg-[#8b5cf6]/10 text-[#c4b5fd] border border-dashed border-[#8b5cf6]/30",
}
```

### 3.3 AI Widget Styling

```typescript
// AI Assistant Widget styles
const aiWidgetStyles = {
  container: "fixed bottom-4 right-4 z-50",
  collapsed: "w-[420px] h-12 rounded-full bg-[#0d0d0e] border border-[#27272a] shadow-lg shadow-purple-500/5",
  expanded: "w-[420px] h-[600px] rounded-2xl bg-[#0d0d0e] border border-[#27272a] shadow-xl shadow-purple-500/10",
  header: "flex items-center justify-between px-4 py-3 border-b border-[#1f1f1f]",
  messages: "flex-1 overflow-y-auto p-4 space-y-4",
  input: "p-4 border-t border-[#1f1f1f] bg-[#0a0a0b]",
}
```

---

## Part 4: Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

1. **Create AI Service Layer**
   - `src/lib/ai/assistant.ts` - Core AI interaction logic
   - `src/lib/ai/context.ts` - Context gathering from current page/selection
   - `src/lib/ai/actions.ts` - AI action handlers (create issue, update, etc.)

2. **Build AI Widget Component**
   - `src/components/ai/AIAssistantWidget.tsx`
   - `src/components/ai/AIMessage.tsx`
   - `src/components/ai/AIQuickActions.tsx`
   - `src/components/ai/AISuggestion.tsx`

3. **Create AI Context Provider**
   - `src/context/AIContext.tsx` - Global AI state management

### Phase 2: Dashboard Redesign (Week 3-4)

1. **New Dashboard Components**
   - Replace current dashboard with AI-powered version
   - Implement AI Focus Items algorithm
   - Create AI Insights generation service

2. **Sidebar Simplification**
   - Refactor sidebar to new structure
   - Add "More" collapsible section
   - Integrate AI quick access

### Phase 3: View Enhancements (Week 5-6)

1. **Natural Language Filtering**
   - Add AI filter bar to ViewRenderer
   - Implement filter-to-query translation

2. **AI View Actions**
   - Summarize, Prioritize, Analyze, Report features

### Phase 4: Issue Intelligence (Week 7-8)

1. **AI Issue Sidebar**
   - Smart suggestions panel
   - Related issues finder
   - Impact analysis

2. **Writing Assistant**
   - Description enhancement
   - Auto-categorization
   - Acceptance criteria generation

### Phase 5: Polish & Integration (Week 9-10)

1. **Bug Fixes**
   - Fix issue link routing
   - Performance optimization
   - Mobile responsiveness

2. **MCP Enhancement**
   - Add new AI-specific MCP endpoints
   - Real-time AI streaming support

---

## Part 5: Technical Architecture

### 5.1 AI Service Integration

```
┌─────────────────────────────────────────────────────────────┐
│                    Collab Platform                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────┐     ┌───────────────┐                   │
│  │  AI Widget    │────▶│  AI Context   │                   │
│  │  Component    │     │  Provider     │                   │
│  └───────────────┘     └───────┬───────┘                   │
│                                │                            │
│                        ┌───────▼───────┐                   │
│                        │  AI Service   │                   │
│                        │  Layer        │                   │
│                        └───────┬───────┘                   │
│                                │                            │
│         ┌──────────────────────┼──────────────────────┐    │
│         │                      │                      │    │
│  ┌──────▼──────┐       ┌──────▼──────┐       ┌──────▼────┐ │
│  │  MCP Server │       │  Claude API  │       │  Actions  │ │
│  │  (Internal) │       │  (Direct)    │       │  Handler  │ │
│  └─────────────┘       └─────────────┘       └───────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Context Gathering

```typescript
interface AIContext {
  // User context
  user: {
    id: string;
    name: string;
    role: string;
    preferences: UserPreferences;
  };

  // Current page context
  page: {
    type: 'dashboard' | 'view' | 'issue' | 'project';
    id?: string;
    data?: any;
  };

  // Selection context
  selection: {
    issues?: string[];
    text?: string;
  };

  // Workspace context
  workspace: {
    id: string;
    projects: ProjectSummary[];
    recentActivity: Activity[];
  };
}
```

### 5.3 AI Action Types

```typescript
type AIAction =
  | { type: 'create_issue'; params: CreateIssueParams }
  | { type: 'update_issue'; params: UpdateIssueParams }
  | { type: 'search'; params: SearchParams }
  | { type: 'summarize'; params: SummarizeParams }
  | { type: 'analyze'; params: AnalyzeParams }
  | { type: 'suggest'; params: SuggestParams }
  | { type: 'navigate'; params: NavigateParams };
```

---

## Part 6: Success Metrics

### 6.1 User Engagement
- AI widget usage rate (target: 70% of users weekly)
- Average AI interactions per user per day (target: 5+)
- Task completion via AI vs manual (target: 40% via AI)

### 6.2 Efficiency Gains
- Time to create issues (target: 50% reduction)
- Time to find relevant information (target: 60% reduction)
- Reduction in context switching (target: 40% reduction)

### 6.3 User Satisfaction
- NPS score improvement (target: +15 points)
- Feature satisfaction survey (target: 4.5/5)
- Support ticket reduction (target: 30% reduction)

---

## Part 7: Files to Create/Modify

### New Files
```
src/components/ai/
├── AIAssistantWidget.tsx
├── AIMessage.tsx
├── AIQuickActions.tsx
├── AISuggestion.tsx
├── AIFilterBar.tsx
├── AIInsightsPanel.tsx
└── index.ts

src/lib/ai/
├── assistant.ts
├── context.ts
├── actions.ts
├── prompts.ts
└── index.ts

src/context/
└── AIContext.tsx

src/hooks/
└── useAI.ts

src/app/api/ai/
├── chat/route.ts
├── suggest/route.ts
├── summarize/route.ts
└── analyze/route.ts

src/components/dashboard/
├── AIFocusItems.tsx
├── SprintHealthCard.tsx
├── AIInsightsPanel.tsx
├── NeedsResponseCard.tsx
├── QuickActionsBar.tsx
└── PersonalizedGreeting.tsx
```

### Files to Modify
```
src/components/layout/Sidebar.tsx          # Simplify navigation
src/app/(main)/[workspaceId]/dashboard/page.tsx  # New AI dashboard
src/components/views/ViewRenderer.tsx      # Add AI filter bar
src/components/issue/IssueDetailContent.tsx  # Add AI sidebar
src/components/ui/button.tsx              # Add AI variants
src/app/(main)/[workspaceId]/layout.tsx   # Add AI widget
```

---

## Conclusion

This transformation will position Collab as a truly AI-native platform where:

1. **AI is always accessible** via the floating assistant widget
2. **Every interaction is enhanced** with intelligent suggestions
3. **Navigation is simplified** to focus on what matters
4. **The dashboard becomes proactive** rather than passive
5. **MCP integration enables seamless Claude Code workflows**

The result is a platform that feels like having an intelligent co-pilot for project management - understanding context, suggesting actions, and automating routine tasks while keeping the user in control.

---

*Document Version: 1.0*
*Created: January 2025*
*Author: Claude Code Analysis*
