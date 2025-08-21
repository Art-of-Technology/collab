# Migration Plan: TaskBoard/Task/Epic/Story → Project/Issue

## Overview
This migration transforms our current multi-model structure (TaskBoard, Task, Epic, Story, Milestone) into a unified Project/Issue system similar to Linear.app.

## Migration Strategy

### Pre-Migration Steps
1. **Backup database** - Essential for rollback capability
2. **Run in development first** - Test complete migration flow
3. **Verify data integrity** - Check all relationships and constraints

### Phase 1: Data Migration (Zero Downtime)

#### Step 1: Migrate TaskBoard → Project
```sql
-- Copy all TaskBoard data to Project table
INSERT INTO "Project" (
  id, name, slug, description, workspaceId, isDefault, 
  createdAt, updatedAt, issuePrefix, nextIssueNumbers
)
SELECT 
  id, name, slug, description, workspaceId, isDefault,
  createdAt, updatedAt, issuePrefix,
  -- Convert single nextIssueNumber to JSON object (using BUG)
  FORMAT('{"EPIC": %s, "STORY": %s, "TASK": %s, "BUG": %s, "MILESTONE": %s, "SUBTASK": %s}', 
    nextIssueNumber, nextIssueNumber, nextIssueNumber, 
    nextIssueNumber, nextIssueNumber, nextIssueNumber)::json
FROM "TaskBoard";
```

#### Step 2: Update TaskColumn references
```sql
-- Update TaskColumn to reference Project instead of TaskBoard
UPDATE "TaskColumn" 
SET projectId = taskBoardId 
WHERE taskBoardId IS NOT NULL;
```

#### Step 3: Migrate Task → Issue
```sql
-- Migrate all Task records to Issue with type TASK
INSERT INTO "Issue" (
  id, title, description, type, status, priority, storyPoints,
  parentId, assigneeId, reporterId, projectId, workspaceId, columnId,
  dueDate, startDate, createdAt, updatedAt, position, postId
)
SELECT 
  id, title, description, 'TASK', status, priority, storyPoints,
  parentTaskId, assigneeId, reporterId, taskBoardId, workspaceId, columnId,
  dueDate, null, createdAt, updatedAt, position, postId
FROM "Task";
```

#### Step 4: Migrate Epic → Issue
```sql
-- Migrate all Epic records to Issue with type EPIC
INSERT INTO "Issue" (
  id, title, description, type, status, priority, 
  assigneeId, reporterId, projectId, workspaceId, columnId,
  dueDate, startDate, createdAt, updatedAt, position, progress, color
)
SELECT 
  id, title, description, 'EPIC', status, priority,
  assigneeId, reporterId, taskBoardId, workspaceId, columnId,
  dueDate, startDate, createdAt, updatedAt, position, progress, color
FROM "Epic";
```

#### Step 5: Migrate Story → Issue
```sql
-- Migrate all Story records to Issue with type STORY
INSERT INTO "Issue" (
  id, title, description, type, status, priority, storyPoints,
  parentId, assigneeId, reporterId, projectId, workspaceId, columnId,
  dueDate, startDate, createdAt, updatedAt, position, color
)
SELECT 
  id, title, description, 'STORY', status, priority, storyPoints,
  epicId, assigneeId, reporterId, taskBoardId, workspaceId, columnId,
  dueDate, startDate, createdAt, updatedAt, position, color
FROM "Story";
```

#### Step 6: Migrate Milestone → Issue
```sql
-- Migrate all Milestone records to Issue with type MILESTONE
INSERT INTO "Issue" (
  id, title, description, type, status, 
  assigneeId, reporterId, projectId, workspaceId, columnId,
  dueDate, startDate, createdAt, updatedAt, position, color
)
SELECT 
  id, title, description, 'MILESTONE', status,
  assigneeId, reporterId, taskBoardId, workspaceId, columnId,
  dueDate, startDate, createdAt, updatedAt, position, color
FROM "Milestone";
```

#### Step 7: Update Issue Parent Relationships
```sql
-- Update Story parent relationships (Stories belong to Epics)
UPDATE "Issue" 
SET parentId = (
  SELECT epicId FROM "Story" 
  WHERE "Story".id = "Issue".id AND "Story".epicId IS NOT NULL
)
WHERE type = 'STORY';

-- Update Task parent relationships (Tasks can belong to Stories)
UPDATE "Issue" 
SET parentId = (
  SELECT storyId FROM "Task" 
  WHERE "Task".id = "Issue".id AND "Task".storyId IS NOT NULL
)
WHERE type = 'TASK';

-- Handle Tasks that belong directly to Epics
UPDATE "Issue" 
SET parentId = (
  SELECT epicId FROM "Task" 
  WHERE "Task".id = "Issue".id AND "Task".epicId IS NOT NULL AND "Task".storyId IS NULL
)
WHERE type = 'TASK' AND parentId IS NULL;
```

### Phase 2: Generate New Issue Keys

#### Step 8: Generate Type-Prefixed Issue Keys
```sql
-- Function to generate new issue keys with type prefixes
-- This will be implemented in the application layer for better control
```

### Phase 3: Create Default Views

#### Step 9: Create Default Kanban Views for Each Project
```sql
-- Create default Kanban view for each project
INSERT INTO "View" (
  id, name, description, workspaceId, ownerId, displayType, 
  projectIds, workspaceIds, visibility, isDefault, 
  filters, sorting, grouping, layout, createdAt, updatedAt
)
SELECT 
  gen_random_uuid(), 
  p.name || ' - Default View',
  'Default Kanban view for ' || p.name,
  p.workspaceId,
  w.ownerId,
  'KANBAN',
  ARRAY[p.id],
  ARRAY[p.workspaceId],
  'WORKSPACE',
  true,
  '{"status": null, "assignee": null, "type": null}',
  '{"field": "position", "direction": "asc"}',
  '{"field": "status"}',
  '{"columns": "auto"}',
  NOW(),
  NOW()
FROM "Project" p
JOIN "Workspace" w ON p.workspaceId = w.id;
```

### Phase 4: Update Relationship Tables

#### Step 10: Update All Foreign Key References
```sql
-- Update BoardItemActivity to reference Issues instead of individual models
UPDATE "BoardItemActivity" 
SET itemId = taskId, itemType = 'TASK'
WHERE taskId IS NOT NULL;

-- Update TaskAssignee to reference Issues (taskId becomes issueId)
-- This will be handled at application level since the relationship is already correct

-- Update TaskAttachment to reference Issues
-- Already correct since it references taskId which maps to Issue.id

-- Update TaskComment → IssueComment migration
-- This will be handled separately as it's a model rename
```

#### Step 11: Migrate TaskComment → IssueComment
```sql
-- Migrate TaskComment to IssueComment
INSERT INTO "IssueComment" (
  id, content, issueId, authorId, createdAt, updatedAt, html, parentId
)
SELECT 
  id, content, taskId, authorId, createdAt, updatedAt, html, parentId
FROM "TaskComment";

-- Migrate TaskCommentReaction to IssueCommentReaction
INSERT INTO "IssueCommentReaction" (
  id, type, commentId, authorId, createdAt
)
SELECT 
  id, type, taskCommentId, authorId, createdAt
FROM "TaskCommentReaction";
```

### Phase 5: Update Notification References

#### Step 12: Update Notification System
```sql
-- Update notifications to reference new models
-- This requires careful mapping of old IDs to new Issue IDs
UPDATE "Notification" 
SET taskId = (SELECT id FROM "Issue" WHERE "Issue".id = "Notification".taskId AND type = 'TASK')
WHERE taskId IS NOT NULL;

UPDATE "Notification" 
SET epicId = (SELECT id FROM "Issue" WHERE "Issue".id = "Notification".epicId AND type = 'EPIC')
WHERE epicId IS NOT NULL;

UPDATE "Notification" 
SET storyId = (SELECT id FROM "Issue" WHERE "Issue".id = "Notification".storyId AND type = 'STORY')
WHERE storyId IS NOT NULL;

UPDATE "Notification" 
SET milestoneId = (SELECT id FROM "Issue" WHERE "Issue".id = "Notification".milestoneId AND type = 'MILESTONE')
WHERE milestoneId IS NOT NULL;
```

## Post-Migration Steps

### Phase 6: Verification and Cleanup

#### Step 13: Data Integrity Verification
- [ ] Verify all TaskBoard records migrated to Project
- [ ] Verify all Task/Epic/Story/Milestone records migrated to Issue
- [ ] Verify parent-child relationships are correct
- [ ] Verify all foreign key references are updated
- [ ] Verify default views are created
- [ ] Test application functionality

#### Step 14: Performance Optimization
- [ ] Rebuild indexes after migration
- [ ] Update database statistics
- [ ] Run VACUUM ANALYZE on PostgreSQL

## Application Layer Changes Required

### 1. Issue Key Generation Service
- Implement type-prefixed key generation (PROJ-E1, PROJ-S1, etc.)
- Update existing keys during migration

### 2. API Updates
- Update all endpoints to use Issue model instead of separate models
- Implement type-based filtering and validation
- Update GraphQL schema if applicable

### 3. Frontend Updates (Linear.app style)
- Update all components to use unified Issue model
- Implement Linear-style UI/UX
- Update routing: `/workspace/views/:viewId`
- Implement view switcher and filters

### 4. Permission System Updates
- Implement view-level permission checks
- Cross-workspace view validation
- Shared view functionality

## Rollback Plan

If migration fails:
1. **Stop application**
2. **Restore database from backup**
3. **Investigate issues**
4. **Fix migration script**
5. **Retry migration in development**

## Testing Checklist

- [ ] All data migrated correctly
- [ ] No data loss
- [ ] All relationships intact
- [ ] New issue keys generated
- [ ] Default views created
- [ ] Application functions correctly
- [ ] Performance acceptable
- [ ] All tests pass

## Risk Mitigation

1. **Data Loss Prevention**: Multiple backups and verification steps
2. **Downtime Minimization**: Careful planning and testing
3. **Rollback Capability**: Complete backup and rollback procedures
4. **Performance Impact**: Off-peak migration timing
5. **User Impact**: Clear communication and training

## Timeline Estimate

- **Development & Testing**: 2-3 days
- **Migration Execution**: 2-4 hours (depending on data size)
- **Verification**: 1-2 hours
- **Total**: 3-4 days including testing 