# Activity Detection Improvements - Analysis Summary

## 📊 Key Findings

### Problem Identified
**78% of status changes are made by non-assignees**

This means:
- Team leads moving issues to "Done" on behalf of team members
- Colleagues helping each other by updating statuses
- These actions incorrectly appear as the actor's completed work

### Activity Distribution
- **DESCRIPTION_UPDATED**: 17,312 (most common - editing descriptions)
- **VIEWED**: 6,885 (tracking views)
- **STATUS_CHANGED**: 2,808 (critical for planning)
- **CREATED**: 1,234 (new issues)
- **ASSIGNED**: 339 (ownership changes)
- **TITLE_UPDATED**: 196
- Other actions: TYPE_CHANGED, PRIORITY_CHANGED, UNASSIGNED, etc.

## 🎯 Improved Detection Rules

### Rule 1: Assignee Priority
**Only count work toward the assignee, not the actor**

```typescript
if (activity.action === 'STATUS_CHANGED' && activity.newValue === 'done') {
  // Check who the issue is assigned to, not who changed the status
  const assigneeAtTimeOfChange = issue.assigneeId;
  
  if (assigneeAtTimeOfChange) {
    // Credit goes to the assignee
    addToCompleted(assigneeAtTimeOfChange, issue);
  }
  // Actor's involvement is logged but doesn't count as their work
}
```

### Rule 2: Assignment Timing
**Consider when the issue was assigned**

```typescript
if (issue.assignedAt && activity.createdAt) {
  const assignmentDuration = activity.createdAt - issue.assignedAt;
  
  // Only count if assigned for meaningful duration (e.g., > 1 hour)
  if (assignmentDuration > ONE_HOUR) {
    // Legitimate work
  } else {
    // Likely just moving cards around
  }
}
```

### Rule 3: Activity Pattern Analysis
**Look for patterns that indicate actual work**

```typescript
const userActivities = activities.filter(a => 
  a.userId === issue.assigneeId && 
  a.itemId === issue.id
);

// Signs of actual work:
// - Multiple status changes by assignee
// - Description updates by assignee
// - Comments by assignee
// - Multiple views over time by assignee

const workIndicators = {
  statusChanges: userActivities.filter(a => a.action === 'STATUS_CHANGED').length,
  updates: userActivities.filter(a => a.action === 'DESCRIPTION_UPDATED').length,
  views: userActivities.filter(a => a.action === 'VIEWED').length,
};

const hasRealWork = (
  workIndicators.statusChanges >= 1 ||
  workIndicators.updates >= 1 ||
  workIndicators.views >= 3
);
```

### Rule 4: Unassigned Work Detection
**Handle unassigned issues intelligently**

```typescript
if (!issue.assigneeId) {
  // Look for dominant actor
  const actorFrequency = activities.reduce((acc, a) => {
    acc[a.userId] = (acc[a.userId] || 0) + 1;
    return acc;
  }, {});
  
  const dominantActor = Object.entries(actorFrequency)
    .sort(([,a], [,b]) => b - a)[0]?.[0];
    
  // Suggest assigning to dominant actor
  if (dominantActor && actorFrequency[dominantActor] >= 3) {
    suggestAssignment(issue, dominantActor);
  }
}
```

## 🔧 Manual Planning Features

### 1. Manual Issue Assignment
Users can manually add issues to anyone's plan:
- Drag-and-drop interface
- Explicit assignment for specific dates
- Override automatic detection
- Add notes/context

### 2. Plan Entry Model
```prisma
model PlanEntry {
  id          String   @id @default(cuid())
  userId      String   // Who this is planned for
  issueId     String   // What issue
  date        DateTime // Which day
  source      PlanSource // AUTO_DETECTED | MANUALLY_ADDED
  addedBy     String?  // Who added it (if manual)
  notes       String?  // Optional context
  createdAt   DateTime @default(now())
  
  user        User     @relation(fields: [userId], references: [id])
  issue       Issue    @relation(fields: [issueId], references: [id])
  addedByUser User?    @relation("PlanEntryAdder", fields: [addedBy], references: [id])
  
  @@unique([userId, issueId, date])
  @@index([userId, date])
}

enum PlanSource {
  AUTO_DETECTED
  MANUALLY_ADDED
  SUGGESTED
}
```

### 3. UI Enhancements
- "Add to Plan" button on each issue
- Date picker for planning ahead
- Assignee selector
- Notes field for context
- Visual distinction between auto and manual entries

## 📝 Implementation Priority

1. ✅ **Create analysis script** (Done)
2. 🔄 **Update detection algorithm** (Next)
3. 🔄 **Add PlanEntry model**
4. 🔄 **Update teamSyncAnalyzer**
5. 🔄 **Add manual planning API**
6. 🔄 **Update UI components**

## 🎯 Expected Outcomes

- **Accurate Attribution**: Work credited to assignees, not actors
- **Flexible Planning**: Manual overrides when needed
- **Better Detection**: Multiple signals for actual work
- **Clear Provenance**: Know what's auto vs. manual


