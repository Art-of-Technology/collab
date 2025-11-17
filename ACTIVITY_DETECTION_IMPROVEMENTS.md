# 🎯 Activity Detection Improvements - Implementation Summary

## ✅ Completed

### 1. **Data Analysis**
Created `scripts/analyze-issue-activities.ts` that revealed:
- **78% of status changes are made by non-assignees**
- This causes incorrect work attribution (actor vs. assignee problem)
- Clear patterns showing team leads and colleagues moving cards for each other

### 2. **New Database Model**
Added `PlanEntry` model to Prisma schema:
```prisma
model PlanEntry {
  id          String      @id @default(cuid())
  userId      String      // Who this is planned for
  issueId     String      // What issue
  date        DateTime    // Which day
  source      PlanSource  @default(AUTO_DETECTED)
  addedBy     String?     // Who added it (if manual)
  notes       String?     // Optional context
  confirmed   Boolean     @default(false)
  
  user        User
  issue       Issue
  addedByUser User?
}

enum PlanSource {
  AUTO_DETECTED    // System detected from activities
  MANUALLY_ADDED   // User manually added
  SUGGESTED        // System suggests, awaits confirmation
}
```

### 3. **Improved Detection Logic**
Created `src/utils/teamSyncAnalyzerImproved.ts` with key improvements:

#### 🔥 Key Fix: Assignee-Based Attribution
**Before:**
```typescript
const userId = activity.userId; // ❌ Credits work to actor
```

**After:**
```typescript
const assigneeId = issue.assigneeId; // ✅ Credits work to assignee
const actorName = activity.userId !== assigneeId ? activity.user?.name : undefined;
```

#### 🎯 Better Detection Rules:
1. **Work credited to assignees only**
2. **Track who performed action separately** (shown in UI)
3. **Handle unassigned issues** (skip or suggest assignment)
4. **Merge manual + auto-detected entries**
5. **Support for manual planning**

### 4. **New Functions**
- `analyzeYesterdayImproved()`: Credits work to assignees
- `addToPlan()`: Manually add issues to someone's plan
- `removeFromPlan()`: Remove from plan
- `getManualPlanEntries()`: Query manual entries

## 🔄 In Progress

### Update Original Analyzer
Need to replace the functions in `src/utils/teamSyncAnalyzer.ts` with improved versions.

### API Endpoints
Create:
- `POST /api/workspaces/[workspaceId]/plan-entries` - Add to plan
- `DELETE /api/workspaces/[workspaceId]/plan-entries` - Remove from plan
- `GET /api/workspaces/[workspaceId]/plan-entries` - List manual entries

## 📋 Pending Tasks

### 1. Database Migration
Currently blocked by shadow DB issue. Workaround:
```bash
npx prisma db push  # For development
# OR
Fix shadow DB and run: npx prisma migrate dev
```

### 2. UI Enhancements
Need to add to `TeamSyncView` and `PlanningViewRenderer`:
- "Add to Plan" button on issues
- Date picker for planning ahead
- Assignee selector dropdown
- Notes/context field
- Visual badges: 🤖 AUTO | ✋ MANUAL
- Show actor name when different from assignee

### 3. Testing
- Verify assignee-based attribution works correctly
- Test manual planning workflow
- Ensure filters still work with mixed sources

## 📊 Expected Impact

### Before
```
Person Y moves Issue-123 (assigned to Person X) to Done
❌ Shows in Person Y's completed work
❌ Missing from Person X's work
```

### After
```
Person Y moves Issue-123 (assigned to Person X) to Done
✅ Shows in Person X's completed work
✅ Note: "Moved by Person Y" (optional info)
```

## 🎨 UI Mockup

```
┌─────────────────────────────────────────────┐
│  📋 Person X's Plan - Nov 14                │
├─────────────────────────────────────────────┤
│                                             │
│  Yesterday ✅                               │
│  ┌─────────────────────────────────────┐   │
│  │ 🤖 CLB-123: Fix bug                 │   │
│  │    Moved by Person Y                │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────────────────────┐   │
│  │ ✋ CLB-124: Review PR                │   │
│  │    Manually added by Team Lead      │   │
│  │    Note: "Priority review"          │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  Today 🎯                                   │
│  ┌─────────────────────────────────────┐   │
│  │ 🤖 CLB-125: Implement feature       │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  [+ Add Issue] [📅 Plan for later]         │
└─────────────────────────────────────────────┘
```

## 🚀 Next Steps

1. **Apply Migration** - Run `npx prisma db push` or fix shadow DB
2. **Create API** - Manual planning endpoints
3. **Update UI** - Add manual planning controls
4. **Test** - Verify with real team data
5. **Deploy** - Roll out improved detection

## 📝 Notes

- Original analyzer is preserved in case rollback needed
- Improved version is backward compatible
- Manual entries override auto-detection
- All changes are tracked with source field


