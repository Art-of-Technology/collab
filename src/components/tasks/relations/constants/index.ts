import { ItemType, RelationsConfig } from '../types';

// Configuration for each item type
export const RELATIONS_CONFIG: Record<ItemType, RelationsConfig> = {
  task: {
    availableRelations: [
      { type: 'MILESTONE', label: 'Milestones', key: 'milestones', urlPath: 'milestones' },
      { type: 'EPIC', label: 'Epics', key: 'epics', urlPath: 'epics' },
      { type: 'STORY', label: 'Stories', key: 'stories', urlPath: 'stories' },
      { type: 'PARENT_TASK', label: 'Parent Tasks', key: 'parentTasks', urlPath: 'tasks', isParent: true },
      { type: 'PARENT_TASK', label: 'Subtasks', key: 'subtasks', urlPath: 'tasks' }
    ]
  },
  epic: {
    availableRelations: [
      { type: 'MILESTONE', label: 'Milestone', key: 'milestones', urlPath: 'milestones' },
      { type: 'STORY', label: 'Stories', key: 'stories', urlPath: 'stories' },
      { type: 'PARENT_TASK', label: 'Tasks', key: 'parentTasks', urlPath: 'tasks' }
    ]
  },
  story: {
    availableRelations: [
      { type: 'EPIC', label: 'Epic', key: 'epics', urlPath: 'epics' },
      { type: 'PARENT_TASK', label: 'Tasks', key: 'parentTasks', urlPath: 'tasks' }
    ]
  },
  milestone: {
    availableRelations: [
      { type: 'EPIC', label: 'Epics', key: 'epics', urlPath: 'epics' },
      { type: 'STORY', label: 'Stories', key: 'stories', urlPath: 'stories' },
      { type: 'PARENT_TASK', label: 'Tasks', key: 'parentTasks', urlPath: 'tasks' }
    ]
  }
};