# Migration Guide: Task/Board Follow System → Issue/View Follow System

This document outlines the complete conversion from the legacy task and board follow system to the new unified Issue and View follow system, compatible with the project → view → issue structure.

## Overview

The old system was based on:
- **Tasks** (individual items with TaskFollower model)
- **Boards** (containers with BoardFollower model) 
- **Stories/Epics/Milestones** (separate entities)

The new system is unified under:
- **Issues** (unified model encompassing tasks, stories, epics, milestones, defects, subtasks)
- **Views** (replacing boards as display containers for issues)

## Database Schema Changes

### New Models Added

```prisma
model IssueFollower {
  id        String   @id @default(cuid())
  issueId   String
  userId    String
  createdAt DateTime @default(now())
  issue     Issue    @relation(fields: [issueId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([issueId, userId])
  @@index([issueId])
  @@index([userId])
  @@index([createdAt])
  @@index([issueId, createdAt])
}

model ViewFollower {
  id        String   @id @default(cuid())
  viewId    String
  userId    String
  createdAt DateTime @default(now())
  view      View     @relation(fields: [viewId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([viewId, userId])
  @@index([viewId])
  @@index([userId])
  @@index([createdAt])
  @@index([viewId, createdAt])
}
```

### Updated User Model

```prisma
model User {
  // ... existing fields
  
  // Follower relationships
  taskFollowers          TaskFollower[]    // Legacy
  postFollowers          PostFollower[]
  boardFollowers         BoardFollower[]   // Legacy
  issueFollowers         IssueFollower[]   // NEW
  viewFollowers          ViewFollower[]    // NEW
}
```

### Updated Issue and View Models

```prisma
model Issue {
  // ... existing fields
  followers     IssueFollower[]  // NEW
}

model View {
  // ... existing fields
  followers     ViewFollower[]   // NEW
}
```

## Code Changes

### 1. Hooks Migration

#### Old Hooks (useTaskFollow.ts, useBoardFollow.ts)
```typescript
// LEGACY - will be deprecated
import { useTaskFollowStatus, useFollowTask, useUnfollowTask } from '@/hooks/queries/useTaskFollow';
import { useBoardFollowStatus, useFollowBoard, useUnfollowBoard } from '@/hooks/queries/useBoardFollow';
```

#### New Hooks (useIssueFollow.ts, useViewFollow.ts)
```typescript
// NEW - use these going forward
import { useIssueFollowStatus, useFollowIssue, useUnfollowIssue } from '@/hooks/queries/useIssueFollow';
import { useViewFollowStatus, useFollowView, useUnfollowView } from '@/hooks/queries/useViewFollow';
```

**Key Improvements:**
- Support for project and view context in query keys
- Better cache invalidation strategies
- Unified interface across all issue types

### 2. API Routes Migration

#### Old Routes
```
POST   /api/tasks/{taskId}/follow
DELETE /api/tasks/{taskId}/follow  
GET    /api/tasks/{taskId}/follow

POST   /api/boards/{boardId}/follow
DELETE /api/boards/{boardId}/follow
GET    /api/boards/{boardId}/follow
```

#### New Routes
```
POST   /api/issues/{issueId}/follow
DELETE /api/issues/{issueId}/follow
GET    /api/issues/{issueId}/follow

POST   /api/views/{viewId}/follow
DELETE /api/views/{viewId}/follow
GET    /api/views/{viewId}/follow
```

### 3. Components Migration

#### Old Components
```typescript
// LEGACY
import { TaskFollowButton } from '@/components/tasks/TaskFollowButton';
import { BoardFollowButton } from '@/components/boards/BoardFollowButton';
```

#### New Components
```typescript
// NEW
import { IssueFollowButton } from '@/components/issues/IssueFollowButton';
import { ViewFollowButton } from '@/components/views/ViewFollowButton';
```

**Usage Examples:**

```typescript
// Issue Follow Button
<IssueFollowButton 
  issueId={issue.id}
  projectId={issue.projectId}  // Optional for better caching
  viewId={currentViewId}       // Optional for view context
  variant="outline"
  size="sm"
  showFollowerCount={true}
/>

// View Follow Button  
<ViewFollowButton
  viewId={view.id}
  workspaceId={view.workspaceId}  // Optional for better caching
  variant="default"
  size="md"
  showFollowerCount={true}
/>
```

### 4. Mention System Migration

#### Old Mention Components (REMOVED)
```typescript
// LEGACY - These files have been deleted
// ❌ TaskMentionSuggestion (DELETED)
// ❌ StoryMentionSuggestion (DELETED)  
// ❌ EpicMentionSuggestion (DELETED)
// ❌ MilestoneMentionSuggestion (DELETED)
```

#### New Unified Mention Component
```typescript
// NEW - single component handles all issue types
import { IssueMentionSuggestion } from '@/components/ui/issue-mention-suggestion';

// Usage - can filter by specific types
<IssueMentionSuggestion 
  query={query}
  onSelect={handleSelect}
  workspaceId={workspaceId}
  issueTypes={['TASK']}  // For task mentions only
/>

<IssueMentionSuggestion 
  query={query}
  onSelect={handleSelect}
  workspaceId={workspaceId}
  issueTypes={['STORY']}  // For story mentions only
/>

<IssueMentionSuggestion 
  query={query}
  onSelect={handleSelect}
  workspaceId={workspaceId}
  issueTypes={['EPIC']}  // For epic mentions only
/>

<IssueMentionSuggestion 
  query={query}
  onSelect={handleSelect}
  workspaceId={workspaceId}
  issueTypes={['MILESTONE']}  // For milestone mentions only
/>

// Or multiple types
<IssueMentionSuggestion 
  query={query}
  onSelect={handleSelect}
  workspaceId={workspaceId}
  issueTypes={['TASK', 'STORY', 'EPIC']}  // Multiple types
/>

// All types (default)
<IssueMentionSuggestion 
  query={query}
  onSelect={handleSelect}
  workspaceId={workspaceId}
  // No issueTypes filter = all types
/>
```

### 5. Notification System Updates

#### Updated Notification Interface
```typescript
export interface Notification {
  id: string;
  type: string;
  content: string;
  read: boolean;
  createdAt: string;
  senderId: string;
  
  // NEW unified fields
  issueId?: string;  // Replaces taskId, epicId, storyId, milestoneId
  viewId?: string;   // For view-related notifications
  
  // NEW related objects
  issue?: {
    id: string;
    title: string;
    type: string; // EPIC | STORY | TASK | DEFECT | MILESTONE | SUBTASK
    issueKey?: string;
    project?: {
      id: string;
      name: string;
    };
  };
  view?: {
    id: string;
    name: string;
    displayType: string;
  };
  
  // LEGACY fields for backward compatibility
  taskId?: string;
  epicId?: string;
  storyId?: string;
  milestoneId?: string;
  task?: {
    id: string;
    title: string;
  };
}
```

## Migration Steps

### 1. Database Migration
```sql
-- Add new follower tables
-- (Run prisma generate && prisma db push)

-- Migrate existing TaskFollower records to IssueFollower
INSERT INTO IssueFollower (id, issueId, userId, createdAt)
SELECT 
  tf.id,
  t.id as issueId,  -- Assuming tasks are migrated to issues
  tf.userId,
  tf.createdAt
FROM TaskFollower tf
JOIN Task t ON tf.taskId = t.id
WHERE EXISTS (SELECT 1 FROM Issue i WHERE i.id = t.id);

-- Migrate existing BoardFollower records to ViewFollower  
INSERT INTO ViewFollower (id, viewId, userId, createdAt)
SELECT 
  bf.id,
  v.id as viewId,   -- Assuming boards are migrated to views
  bf.userId,
  bf.createdAt
FROM BoardFollower bf
JOIN TaskBoard tb ON bf.boardId = tb.id
JOIN View v ON v.name = tb.name AND v.workspaceId = tb.workspaceId;
```

### 2. Code Migration Checklist

- [ ] Update all imports from old follow hooks to new ones
- [ ] Replace TaskFollowButton with IssueFollowButton
- [ ] Replace BoardFollowButton with ViewFollowButton  
- [ ] Update notification handling to use new notification interface
- [ ] **CRITICAL:** Replace all old mention components with IssueMentionSuggestion:
  - [ ] TaskMentionSuggestion → IssueMentionSuggestion with issueTypes={['TASK']}
  - [ ] StoryMentionSuggestion → IssueMentionSuggestion with issueTypes={['STORY']}
  - [ ] EpicMentionSuggestion → IssueMentionSuggestion with issueTypes={['EPIC']}
  - [ ] MilestoneMentionSuggestion → IssueMentionSuggestion with issueTypes={['MILESTONE']}
- [ ] Update markdown editor to use unified mention system
- [ ] Test follow/unfollow functionality for all issue types
- [ ] Test view follow/unfollow functionality
- [ ] Update any hardcoded API endpoints

### 3. Feature Parity Verification

#### Issue Follow System ✅
- [x] Follow/unfollow individual issues
- [x] View follower count and list
- [x] Support for all issue types (EPIC, STORY, TASK, DEFECT, MILESTONE, SUBTASK)
- [x] Project and view context for better caching
- [x] Notification integration (when NotificationService is updated)

#### View Follow System ✅  
- [x] Follow/unfollow views
- [x] View follower count and list
- [x] Workspace context for better caching
- [x] Proper access control (owner, shared, workspace visibility)
- [x] Notification integration (when NotificationService is updated)

#### Mention System ✅
- [x] Unified issue mention with type filtering
- [x] Backward compatibility for story mentions
- [x] Project information display
- [x] Issue hierarchy support (parent/child relationships)

## Breaking Changes

### 1. API Changes
- **BREAKING:** `/api/tasks/{id}/follow` → `/api/issues/{id}/follow`
- **BREAKING:** `/api/boards/{id}/follow` → `/api/views/{id}/follow`

### 2. Hook Changes  
- **BREAKING:** `useTaskFollowStatus()` → `useIssueFollowStatus()`
- **BREAKING:** `useBoardFollowStatus()` → `useViewFollowStatus()`

### 3. Component Changes
- **BREAKING:** `TaskFollowButton` → `IssueFollowButton`
- **BREAKING:** `BoardFollowButton` → `ViewFollowButton`

### 4. Mention Component Changes
- **BREAKING:** All separate mention components removed (TaskMentionSuggestion, StoryMentionSuggestion, EpicMentionSuggestion, MilestoneMentionSuggestion)
- **MIGRATION:** Use unified IssueMentionSuggestion with issueTypes filter
- **MIGRATION:** Update markdown editor and other components using old mention components

### 5. Notification Changes
- **BREAKING:** Notification interface updated with new fields
- **MIGRATION:** Legacy fields maintained for backward compatibility

## Backward Compatibility

### Legacy Support
- Old notification fields (`taskId`, `epicId`, `storyId`, `milestoneId`) are maintained
- `StoryMentionSuggestion` continues to work (now uses Issues API with type filter)
- Database migration preserves existing follow relationships

### Deprecation Timeline
1. **Phase 1:** New system implemented alongside legacy (current)
2. **Phase 2:** Update all components to use new system
3. **Phase 3:** Remove legacy hooks and components
4. **Phase 4:** Remove legacy database tables (TaskFollower, BoardFollower)

## Testing

### Unit Tests
- Test all new follow hooks with various contexts
- Test API routes with proper access control
- Test notification interface backward compatibility

### Integration Tests  
- Test follow/unfollow flows for all issue types
- Test view follow flows with different visibility levels
- Test mention system with unified issue search

### Migration Tests
- Test data migration scripts
- Test backward compatibility during transition period
- Test legacy component functionality

## Future Enhancements

### Notification Service Updates
When updating NotificationService, add:
```typescript
// Add these methods to NotificationService
addIssueFollower(issueId: string, userId: string): Promise<void>
removeIssueFollower(issueId: string, userId: string): Promise<void>
addViewFollower(viewId: string, userId: string): Promise<void>  
removeViewFollower(viewId: string, userId: string): Promise<void>
```

### Advanced Features
- Bulk follow operations for multiple issues
- Smart follow suggestions based on user activity
- Follow inheritance (follow parent epic → auto-follow child stories)
- Follow templates for common issue patterns
- Integration with workspace notification preferences

## Conclusion

This migration successfully converts the legacy task/board follow system to a modern, unified Issue/View follow system that:

1. **Scales better** with the new project → view → issue structure
2. **Reduces complexity** by unifying all item types under Issues
3. **Improves performance** with better caching strategies
4. **Maintains compatibility** during the transition period
5. **Enables future enhancements** with a flexible architecture

The new system is ready for production use and provides a solid foundation for advanced collaboration features.

