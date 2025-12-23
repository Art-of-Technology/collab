# Planning View v2 - Product Requirements Document

## Executive Summary

A complete redesign of the Planning View to provide a clear, actionable overview of team progress. Designed for three key personas: **Developers** (daily standup), **Managers** (team health), and **Stakeholders** (delivery tracking).

---

## Problem Statement

The current planning view suffers from:
1. **Information overload** - Too many sections, statuses, and data points
2. **Confusing data structure** - Complex nested types that are hard to maintain
3. **Poor scannability** - Managers can't quickly understand team status
4. **Unclear actions** - Hard to identify what needs attention

---

## Design Principles

1. **Summary First** - Show aggregates, drill down for details
2. **Visual over Text** - Use colors, icons, progress bars instead of text walls
3. **Attention-Driven** - Highlight blockers and issues needing action
4. **Time-Centric** - Everything organized around "when" (today, yesterday, this week)
5. **Minimal Clicks** - Most useful info visible immediately

---

## Core Views

### View 1: Team Dashboard (Default)

The landing view for managers. A single-screen overview of the entire team.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Team Planning                                              Dec 21-22, 2025 │
│  ───────────────────────────────────────────────────────────────────────── │
│                                                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │     12      │ │      8      │ │      3      │ │      2      │           │
│  │  Completed  │ │  In Review  │ │   Active    │ │  Blocked    │           │
│  │   ✓ +5 today│ │             │ │             │ │  ⚠ Needs    │           │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘           │
│                                                                             │
│  Team Members                                                    This Week  │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 👤 Enes Zeren                                          ████████░░ 8 │   │
│  │    ✅ 3 done  │  🔄 2 active  │  👁 4 review  │  🚫 2 blocked        │   │
│  │    ────────────────────────────────────────────────────────────     │   │
│  │    Today: Completed "AWS Lambda Handler" • Started "Auto-Collect"   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 👤 John Smith                                          ██████░░░░ 6 │   │
│  │    ✅ 2 done  │  🔄 3 active  │  👁 1 review  │  🚫 0 blocked        │   │
│  │    ────────────────────────────────────────────────────────────     │   │
│  │    Today: Working on "Payment Integration"                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Features:**
- **Stat Cards** - 4 key metrics at a glance (completed, in review, active, blocked)
- **Member Cards** - Each team member as a compact card showing:
  - Progress bar (workload visualization)
  - Status counts in a single line
  - "Today" highlight - most recent significant action
- **Blocked Indicator** - Red highlight on blocked count, draws attention

---

### View 2: Member Detail (Click on member)

Slide-out panel or expanded view showing one person's detailed activity.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← Back                                                                     │
│                                                                             │
│  👤 Enes Zeren                                                              │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  📊 This Period: 3 completed • 4 in review • 2 active • 2 blocked          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  TODAY - Dec 22                                                     │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  ✅ COMPLETED                                                       │   │
│  │     PYB-234  Create AWS Lambda Handler           → Done at 10:30am  │   │
│  │                                                                     │   │
│  │  🔄 WORKING ON                                                      │   │
│  │     PYB-237  Update Auto-Collect Consumer        ⏱ Started today    │   │
│  │     PYB-236  Test TRON RPC Methods               ⏱ 3 days           │   │
│  │                                                                     │   │
│  │  👁 IN REVIEW                                                       │   │
│  │     PYB-238  Network RPC Endpoints               waiting            │   │
│  │     PYB-216  Year-End Report                     waiting            │   │
│  │     PYB-231  Crypto Address Book                 waiting            │   │
│  │     PYB-235  Manual Retry Failed Swaps           waiting            │   │
│  │                                                                     │   │
│  │  🚫 BLOCKED                                                         │   │
│  │     PYB-T17  SWAP UI Updates                     blocked by PYB-T12 │   │
│  │     PYB-T79  Ledger Integration                  waiting on vendor  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  YESTERDAY - Dec 21                                                 │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  ✅ COMPLETED                                                       │   │
│  │     PYB-232  Fix swap calculation bug            → Done at 4:15pm   │   │
│  │     PYB-229  Add retry logic                     → Done at 11:00am  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Features:**
- **Clear day separation** - Today vs Yesterday clearly divided
- **Status grouping** - Issues grouped by status, not mixed
- **Minimal metadata** - Only show what matters (issue key, title, time info)
- **Actionable blockers** - Show what's blocking each blocked issue

---

### View 3: Standup Mode

A special mode optimized for daily standups - cycles through each team member.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Daily Standup - Dec 22, 2025                           [◀ Prev] [Next ▶]  │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│                         👤 Enes Zeren                                       │
│                            2 of 6 members                                   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │   YESTERDAY I...                                                    │   │
│  │   ─────────────────────────────────────────────────────────────     │   │
│  │   ✅ Completed "Create AWS Lambda Handler"                          │   │
│  │   ✅ Completed "Fix swap calculation bug"                           │   │
│  │   🔄 Worked on "Test TRON RPC Methods"                              │   │
│  │                                                                     │   │
│  │   TODAY I WILL...                                                   │   │
│  │   ─────────────────────────────────────────────────────────────     │   │
│  │   🔄 Continue "Test TRON RPC Methods"                               │   │
│  │   🔄 Continue "Update Auto-Collect Consumer"                        │   │
│  │   👁 Review pending for 4 items                                     │   │
│  │                                                                     │   │
│  │   BLOCKERS                                                          │   │
│  │   ─────────────────────────────────────────────────────────────     │   │
│  │   🚫 "SWAP UI Updates" - blocked by PYB-T12                         │   │
│  │   🚫 "Ledger Integration" - waiting on vendor                       │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ● ● ○ ○ ○ ○                                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Features:**
- **Standup format** - Yesterday/Today/Blockers structure
- **One person at a time** - Focus, no distractions
- **Navigation** - Easy prev/next to cycle through team
- **Progress dots** - Visual indicator of position in team

---

## Data Architecture

### Simplified API Response

Single endpoint: `GET /api/workspaces/{id}/planning/team-activity`

```typescript
interface TeamActivityResponse {
  period: {
    start: string;  // ISO date
    end: string;    // ISO date
  };

  summary: {
    completed: number;
    inReview: number;
    inProgress: number;
    blocked: number;
  };

  members: MemberActivity[];
}

interface MemberActivity {
  user: {
    id: string;
    name: string;
    image: string | null;
  };

  summary: {
    completed: number;
    inReview: number;
    inProgress: number;
    blocked: number;
    workload: number;  // total active items
  };

  // Simple activity by day
  days: {
    [date: string]: DayActivity;
  };

  // Current state (live)
  current: {
    inProgress: SimpleIssue[];
    inReview: SimpleIssue[];
    blocked: BlockedIssue[];
    planned: SimpleIssue[];
  };
}

interface DayActivity {
  completed: CompletedIssue[];
  started: SimpleIssue[];
  movedToReview: SimpleIssue[];
}

interface SimpleIssue {
  id: string;
  key: string;        // e.g., "PYB-234"
  title: string;
  priority: string;
  daysActive?: number; // how long in current status
}

interface CompletedIssue extends SimpleIssue {
  completedAt: string; // ISO datetime
}

interface BlockedIssue extends SimpleIssue {
  blockedBy?: string;  // Issue key or reason
}
```

**Why this is better:**
1. **Flat structure** - No deeply nested types
2. **Clear separation** - Historical (days) vs Current state
3. **Minimal data** - Only what UI needs, nothing more
4. **Easy to extend** - Add fields without breaking existing

---

## Implementation Plan

### Phase 1: New API Endpoint
- Create `/api/workspaces/[id]/planning/team-activity/route.ts`
- Clean data fetching with simplified types
- Remove old complex types from teamSyncAnalyzer

### Phase 2: Team Dashboard Component
- New `TeamDashboard.tsx` component
- Stat cards at top
- Member cards with progress bars
- Click to expand member detail

### Phase 3: Member Detail Panel
- Slide-out panel component
- Day-separated activity view
- Status-grouped issues

### Phase 4: Standup Mode
- Carousel-style navigation
- Yesterday/Today/Blockers format
- Keyboard shortcuts (arrow keys)

### Phase 5: Polish & Cleanup
- Remove old components
- Update routing
- Performance optimization

---

## UI Component Specifications

### Stat Card
```
┌─────────────┐
│     12      │  ← Large number (24px, bold)
│  Completed  │  ← Label (12px, muted)
│  ✓ +5 today │  ← Subtext (10px, green if positive)
└─────────────┘
```
- Width: flexible, min 100px
- Height: 80px
- Background: subtle gradient based on type
- Hover: slight elevation

### Member Card
```
┌─────────────────────────────────────────────────────────────────────┐
│ 👤 Name                                              ████████░░ 8   │
│    ✅ 3  │  🔄 2  │  👁 4  │  🚫 2                                  │
│    Today: Most recent action text here...                           │
└─────────────────────────────────────────────────────────────────────┘
```
- Full width
- Height: ~80px collapsed
- Progress bar: workload out of 10 (configurable)
- Click: expands to show detail

### Issue Row
```
│  ● PYB-234  Issue title here                          ⏱ 3 days     │
```
- Status dot (colored by priority or status)
- Issue key (monospace, clickable)
- Title (truncate if needed)
- Time indicator (right aligned)

---

## Success Metrics

1. **Time to understand** - Manager can assess team status in <10 seconds
2. **Standup efficiency** - Each person's update takes <30 seconds to review
3. **Blocker visibility** - Blocked items are noticed immediately
4. **Maintenance** - New developer can understand code in <30 minutes

---

## File Structure

```
src/
├── app/
│   └── api/
│       └── workspaces/
│           └── [workspaceId]/
│               └── planning/
│                   └── team-activity/
│                       └── route.ts          # New simplified API
│
├── components/
│   └── planning/
│       ├── TeamDashboard.tsx                 # Main container
│       ├── StatCard.tsx                      # Summary stat card
│       ├── MemberCard.tsx                    # Team member row
│       ├── MemberDetail.tsx                  # Expanded member view
│       ├── DaySection.tsx                    # Day activity section
│       ├── IssueRow.tsx                      # Single issue display
│       ├── StandupMode.tsx                   # Standup carousel
│       └── types.ts                          # Clean type definitions
│
└── hooks/
    └── useTeamActivity.ts                    # Data fetching hook
```

---

## Migration Strategy

1. Build new components alongside old ones
2. Add feature flag to switch between old/new
3. Test with real data
4. Remove old components once validated

---

## Appendix: Color Scheme

| Status      | Color   | Hex       |
|-------------|---------|-----------|
| Completed   | Green   | #22c55e   |
| In Progress | Blue    | #3b82f6   |
| In Review   | Purple  | #8b5cf6   |
| Blocked     | Red     | #ef4444   |
| Planned     | Gray    | #6b7280   |
