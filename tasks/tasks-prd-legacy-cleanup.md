# Task List: Legacy Code Cleanup

## Relevant Files

### Phase 1: Unused Components (Zero Imports)
- `src/components/tasks/TaskRow.tsx` - Unused, no imports found
- `src/components/epics/EpicStoryEnhancementModal.tsx` - Unused, no imports found
- `src/components/stories/StoryTaskEnhancementModal.tsx` - Unused, no imports found

### Phase 2: Legacy Pages
- `src/app/(main)/[workspaceId]/tasks/` - Legacy tasks folder
- `src/app/(main)/[workspaceId]/epics/` - Legacy epics folder
- `src/app/(main)/[workspaceId]/stories/` - Legacy stories folder
- `src/app/(main)/[workspaceId]/milestones/` - Legacy milestones folder
- `src/app/tasks/` - Root level legacy tasks

### Phase 3: Legacy API Routes
- `src/app/api/tasks/` - Task API routes
- `src/app/api/epics/` - Epic API routes
- `src/app/api/stories/` - Story API routes
- `src/app/api/milestones/` - Milestone API routes
- `src/app/api/taskboards/` - TaskBoard API routes
- `src/app/api/boards/` - Board API routes
- `src/app/api/ai/` - AI generation routes (legacy parts)

### Phase 4: Legacy Components
- `src/components/tasks/` - Task components folder
- `src/components/epics/` - Epic components folder
- `src/components/stories/` - Story components folder
- `src/components/milestones/` - Milestone components folder

### Phase 5: Legacy Hooks
- `src/hooks/queries/useEpic.ts`
- `src/hooks/queries/useMilestone.ts`
- `src/hooks/queries/useTaskBoard.ts`
- `src/hooks/queries/useTaskComment.ts`
- `src/hooks/queries/useTask.ts`
- `src/hooks/queries/useTaskFollow.ts`
- `src/hooks/queries/useBoardFollow.ts`
- `src/hooks/queries/useBoardItems.ts`
- `src/hooks/queries/useTaskSessions.ts`

### Phase 6: Legacy Contexts
- `src/context/TasksContext.tsx`
- `src/context/TaskModalContext.tsx`
- `src/context/BoardGenerationContext.tsx`

### Phase 7: Prisma Schema
- `prisma/schema.prisma` - Remove legacy models

### Notes
- Run `npm run build` to verify no build errors after each phase
- Run `npm test` if tests exist
- Commit after each major phase

## Tasks

- [x] 1.0 Phase 1: Remove unused components with zero imports
  - [x] 1.1 Delete `src/components/tasks/TaskRow.tsx`
  - [x] 1.2 Delete `src/components/epics/EpicStoryEnhancementModal.tsx`
  - [x] 1.3 Delete `src/components/stories/StoryTaskEnhancementModal.tsx`
  - [x] 1.4 Run build to verify no errors

- [x] 2.0 Phase 2: Remove legacy pages
  - [x] 2.1 Delete `src/app/(main)/[workspaceId]/tasks/` folder
  - [x] 2.2 Delete `src/app/(main)/[workspaceId]/epics/` folder
  - [x] 2.3 Delete `src/app/(main)/[workspaceId]/stories/` folder
  - [x] 2.4 Delete `src/app/(main)/[workspaceId]/milestones/` folder
  - [x] 2.5 Delete `src/app/tasks/` folder
  - [x] 2.6 Run build to verify no errors

- [x] 3.0 Phase 3: Remove legacy API routes
  - [x] 3.1 Delete `src/app/api/tasks/` folder
  - [x] 3.2 Delete `src/app/api/epics/` folder
  - [x] 3.3 Delete `src/app/api/stories/` folder
  - [x] 3.4 Delete `src/app/api/milestones/` folder
  - [x] 3.5 Delete `src/app/api/taskboards/` folder
  - [x] 3.6 Delete legacy board routes from `src/app/api/boards/`
  - [x] 3.7 Delete legacy AI generation routes
  - [x] 3.8 Run build to verify no errors

- [x] 4.0 Phase 4: Remove legacy components
  - [x] 4.1 Delete `src/components/tasks/` folder
  - [x] 4.2 Delete `src/components/epics/` folder
  - [x] 4.3 Delete `src/components/stories/` folder
  - [x] 4.4 Delete `src/components/milestones/` folder
  - [x] 4.5 Run build to verify no errors

- [x] 5.0 Phase 5: Remove legacy hooks
  - [x] 5.1 Delete legacy hooks from `src/hooks/queries/`
  - [x] 5.2 Run build to verify no errors

- [x] 6.0 Phase 6: Remove legacy contexts
  - [x] 6.1 Delete legacy context files from `src/context/`
  - [x] 6.2 Run build to verify no errors

- [ ] 7.0 Phase 7: Clean up Prisma schema
  - [ ] 7.1 Remove legacy model definitions
  - [ ] 7.2 Remove legacy relations from User model
  - [ ] 7.3 Remove legacy relations from Workspace model
  - [ ] 7.4 Remove legacy relations from Notification model
  - [ ] 7.5 Generate Prisma client
  - [ ] 7.6 Run build to verify no errors

- [ ] 8.0 Final verification
  - [ ] 8.1 Run full build
  - [ ] 8.2 Run tests if available
  - [ ] 8.3 Verify application starts correctly
