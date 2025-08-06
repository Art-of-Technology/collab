export type ItemType = 'task' | 'epic' | 'story' | 'milestone';

// Define RelationType locally to avoid import issues
export type RelationType = 
  | 'MILESTONE' 
  | 'EPIC' 
  | 'STORY' 
  | 'PARENT_TASK';

export interface Relations {
  epics: any[];
  stories: any[];
  milestones: any[];
  parentTasks: any[];
}

export interface RelationItemProps {
  title: string;
  type: 'milestone' | 'epic' | 'story' | 'task';
  issueKey?: string;
  status?: string;
  href: string;
  onRemove?: () => void;
  canRemove?: boolean;
}

export interface RelationsConfig {
  availableRelations: {
    type: RelationType;
    label: string;
    key: keyof Relations;
    urlPath: string;
    isParent?: boolean;
  }[];
}

export interface UnifiedRelationsSectionProps {
  itemType: ItemType;
  item: any;
  onUpdateRelations?: (updatedItem: any) => void;
  canEdit?: boolean;
}

export interface TaskRelationsProps {
  task: any;
  onUpdateRelations?: (updatedTask: any) => void;
  canEdit?: boolean;
}

export interface EpicRelationsProps {
  epic: any;
  canEdit?: boolean;
}

export interface StoryRelationsProps {
  story: any;
  canEdit?: boolean;
}

export interface MilestoneRelationsProps {
  milestone: any;
  canEdit?: boolean;
}

export interface RelationsSectionProps {
  itemType: 'task' | 'epic' | 'story' | 'milestone';
  itemData: any;
  onUpdateRelations?: (updatedItem: any) => void;
  canEdit?: boolean;
}