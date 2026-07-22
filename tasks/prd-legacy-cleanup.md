# Legacy Code Cleanup Plan

## Overview

The Collab project has migrated from a **Task/Epic/Story/Milestone** system to a **unified Issue** model. This document outlines the cleanup strategy for removing legacy code that is no longer needed.

## Current State Analysis

### NEW System (Active & Primary)
- **Issue** model with `IssueType` enum (TASK, EPIC, STORY, BUG, SUBTASK, MILESTONE)
- **Project** model (replaces TaskBoard)
- **ProjectStatus** model (replaces TaskColumn string statuses)
- **IssueComment**, **IssueAssignee**, **IssueRelation**, **IssueFollower**
- **View** system for customizable issue views
- Components in `src/components/views/`

### LEGACY System (To Be Removed)
- **Task**, **Epic**, **Story**, **Milestone** models
- **TaskBoard**, **TaskColumn** models
- **TaskComment**, **TaskAssignee**, **TaskRelations**, **TaskFollower**
- **BoardGenerationJob** (AI board generation)
- Components in `src/components/tasks/`, `src/components/epics/`, `src/components/stories/`, `src/components/milestones/`

---

## Phase 1: Immediate Cleanup (Unused Components)

These components have **zero imports** and can be safely deleted:

| File | Reason |
|------|--------|
| `src/components/tasks/TaskRow.tsx` | No imports found |
| `src/components/epics/EpicStoryEnhancementModal.tsx` | No imports found |
| `src/components/stories/StoryTaskEnhancementModal.tsx` | No imports found |

---

## Phase 2: Legacy Pages Removal

These pages are not linked in sidebar navigation and serve the old system:

### Pages to Remove
| Page | Path | Reason |
|------|------|--------|
| Tasks Page | `src/app/(main)/[workspaceId]/tasks/page.tsx` | Legacy board UI |
| Tasks Layout | `src/app/(main)/[workspaceId]/tasks/layout.tsx` | Legacy TasksContext |
| Task Detail | `src/app/(main)/[workspaceId]/tasks/[taskId]/page.tsx` | Use Issue detail instead |
| Epic Detail | `src/app/(main)/[workspaceId]/epics/[id]/page.tsx` | Use Issue with type=EPIC |
| Story Detail | `src/app/(main)/[workspaceId]/stories/[id]/page.tsx` | Use Issue with type=STORY |
| Milestone Detail | `src/app/(main)/[workspaceId]/milestones/[id]/page.tsx` | Use Issue with type=MILESTONE |
| Root Tasks | `src/app/tasks/[id]/page.tsx` | Legacy shortlink redirect |

---

## Phase 3: Legacy API Routes Removal

### Task API Routes (26 files)
```
src/app/api/tasks/route.ts
src/app/api/tasks/[taskId]/route.ts
src/app/api/tasks/[taskId]/edit/route.ts
src/app/api/tasks/[taskId]/follow/route.ts
src/app/api/tasks/[taskId]/helpers/route.ts
src/app/api/tasks/[taskId]/comments/route.ts
src/app/api/tasks/[taskId]/comments/[commentId]/route.ts
src/app/api/tasks/search/route.ts
src/app/api/tasks/boards/[boardId]/tasks/route.ts
src/app/api/tasks/by-key/[issueKey]/route.ts
src/app/api/workspaces/[workspaceId]/search-tasks/route.ts
src/app/api/users/[userId]/assigned-tasks/route.ts
```

### Epic API Routes (6 files)
```
src/app/api/epics/route.ts
src/app/api/epics/[epicId]/route.ts
src/app/api/epics/search/route.ts
```

### Story API Routes (6 files)
```
src/app/api/stories/route.ts
src/app/api/stories/[storyId]/route.ts
src/app/api/stories/search/route.ts
```

### Milestone API Routes (5 files)
```
src/app/api/milestones/route.ts
src/app/api/milestones/[milestoneId]/route.ts
src/app/api/milestones/search/route.ts
```

### TaskBoard API Routes
```
src/app/api/taskboards/route.ts
src/app/api/taskboards/[taskBoardId]/route.ts
src/app/api/boards/[boardId]/columns/route.ts
src/app/api/boards/[boardId]/follow/route.ts
src/app/api/boards/import/route.ts
src/app/api/workspaces/[workspaceId]/boards/route.ts
```

### AI Generation Routes (Legacy)
```
src/app/api/ai/board-generation/jobs/route.ts
src/app/api/ai/board-generation/status/route.ts
src/app/api/ai/create-stories/jobs/route.ts
src/app/api/ai/create-stories/start/route.ts
src/app/api/ai/create-tasks/jobs/route.ts
src/app/api/ai/create-tasks/start/route.ts
src/app/api/ai/create-tasks/status/[jobId]/route.ts
src/app/api/ai/jobs/route.ts
```

---

## Phase 4: Legacy Components Removal

### src/components/tasks/ (51 files)
Keep only shared utilities, remove task-specific components:

**Remove:**
- `TasksClient.tsx`
- `TaskDetailClient.tsx`
- `TaskDetailModal.tsx`
- `TaskDetailContent.tsx`
- `TaskTabs.tsx`
- `TaskWorkSessions.tsx`
- `TaskHelpersSection.tsx`
- `TaskActivity.tsx`
- `TaskComment.tsx`
- `TaskCommentsList.tsx`
- `TaskCommentForm.tsx`
- `TaskCommentReplyForm.tsx`
- `TaskFollowButton.tsx`
- `TaskBoardSelector.tsx`
- `TasksHeader.tsx`
- `TaskEditButton.tsx`
- `TaskEditForm.tsx`
- `CreateTaskForm.tsx`
- `KanbanView.tsx`
- `KanbanBoard.tsx`
- `KanbanFilters.tsx`
- `ListView.tsx`
- `GroupedColumn.tsx`
- `EnhancedTaskCard.tsx`
- `ProjectHierarchyView.tsx`
- `ProjectHierarchyBoard.tsx`
- `ProjectHierarchyTabs.tsx`
- `ProjectCalendar.tsx`
- `ProjectTimeline.tsx`
- `BoardGenerationStatus.tsx`
- `BoardImportDialog.tsx`
- `BoardSettings.tsx`
- `CreateBoardDialog.tsx`
- `TaskGenerationStatus.tsx`
- `SessionAdjustmentModal.tsx`
- `TimeAdjustmentModal.tsx`
- `TaskSessionsView.tsx`
- `ShareButton.tsx`
- `selectors/BoardSelect.tsx`
- `selectors/EpicSelect.tsx`
- `selectors/MilestoneSelect.tsx`
- `selectors/StorySelect.tsx`
- `selectors/StatusSelect.tsx`
- `relations/*` (entire folder)

### src/components/epics/ (4 files)
**Remove entire folder:**
- `EpicDetailModal.tsx`
- `EpicDetailContent.tsx`
- `CreateEpicDialog.tsx`
- `EpicStoryEnhancementModal.tsx`

### src/components/stories/ (5 files)
**Remove entire folder:**
- `StoryDetailModal.tsx`
- `StoryDetailContent.tsx`
- `CreateStoryDialog.tsx`
- `StoryGenerationStatus.tsx`
- `StoryTaskEnhancementModal.tsx`

### src/components/milestones/ (3 files)
**Remove entire folder:**
- `MilestoneDetailModal.tsx`
- `MilestoneDetailContent.tsx`
- `CreateMilestoneDialog.tsx`

---

## Phase 5: Legacy Hooks Removal

### src/hooks/queries/
```
useEpic.ts
useMilestone.ts
useTaskBoard.ts
useTaskComment.ts
useTask.ts
useTaskFollow.ts
useBoardFollow.ts
useBoardItems.ts
useTaskSessions.ts
```

---

## Phase 6: Legacy Context Providers Removal

### src/context/
```
TasksContext.tsx
TaskModalContext.tsx
BoardGenerationContext.tsx
```

---

## Phase 7: Prisma Schema Cleanup

### Models to Remove
```prisma
model Task { ... }
model TaskComment { ... }
model TaskCommentReaction { ... }
model TaskAttachment { ... }
model TaskAssignee { ... }
model TaskFollower { ... }
model TaskRelations { ... }

model Epic { ... }
model Story { ... }
model Milestone { ... }

model TaskBoard { ... }
model TaskColumn { ... }  // Keep only if needed for migration
model BoardFollower { ... }
model BoardGenerationJob { ... }
```

### User Model Relations to Remove
```prisma
// Remove from User model:
assignedEpics          Epic[]
reportedEpics          Epic[]
assignedMilestones     Milestone[]
reportedMilestones     Milestone[]
assignedStories        Story[]
reportedStories        Story[]
assignedTasks          Task[]
reportedTasks          Task[]
taskAssignees          TaskAssignee[]
taskAttachments        TaskAttachment[]
taskComments           TaskComment[]
taskCommentReactions   TaskCommentReaction[]
taskFollowers          TaskFollower[]
boardFollowers         BoardFollower[]
boardGenerationJobs    BoardGenerationJob[]
approvedTaskHelpers    TaskAssignee[]
```

### Notification Model Updates
Remove legacy references:
```prisma
// Remove from Notification model:
taskId           String?
epicId           String?
storyId          String?
milestoneId      String?
taskCommentId    String?
task             Task?
epic             Epic?
story            Story?
milestone        Milestone?
taskComment      TaskComment?
```

### Workspace Model Updates
Remove legacy references:
```prisma
// Remove from Workspace model:
epics               Epic[]
milestones          Milestone[]
stories             Story[]
tasks               Task[]
taskBoards          TaskBoard[]
boardGenerationJobs BoardGenerationJob[]
```

---

## Phase 8: Database Migration

After removing Prisma models, create migration:
```bash
npx prisma migrate dev --name remove_legacy_task_system
```

**Important:** Before migration, ensure:
1. All data has been migrated to Issue model
2. Backup database
3. Test in staging environment first

---

## Execution Order

1. **Phase 1** - Remove unused components (safe, no dependencies)
2. **Phase 2** - Remove legacy pages (update any redirects first)
3. **Phase 3** - Remove legacy API routes
4. **Phase 4** - Remove legacy components
5. **Phase 5** - Remove legacy hooks
6. **Phase 6** - Remove legacy contexts
7. **Phase 7** - Update Prisma schema
8. **Phase 8** - Run database migration

---

## Risk Assessment

| Phase | Risk Level | Notes |
|-------|------------|-------|
| 1 | Low | Components have no imports |
| 2 | Medium | May break bookmarks/deep links |
| 3 | High | May break external integrations |
| 4 | Medium | May have indirect usage |
| 5-6 | Medium | Check all imports |
| 7-8 | High | Database changes are irreversible |

---

## Success Criteria

- [ ] All legacy components removed
- [ ] All legacy API routes removed
- [ ] All legacy pages removed
- [ ] Prisma schema contains only Issue-based models
- [ ] Database migration successful
- [ ] Application builds without errors
- [ ] All tests pass
- [ ] No console errors in browser
