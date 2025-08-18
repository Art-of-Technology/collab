export interface IssueActivity {
  id: string;
  action: string;
  details: any;
  createdAt: string;
  fieldName?: string;
  oldValue?: any;
  newValue?: any;
  user: {
    id: string;
    name: string | null;
    image: string | null;
    useCustomAvatar?: boolean;
    avatarSkinTone?: number;
    avatarEyes?: number;
    avatarBrows?: number;
    avatarMouth?: number;
    avatarNose?: number;
    avatarHair?: number;
    avatarEyewear?: number;
    avatarAccessory?: number;
  };
}

export interface IssueActivitySectionProps {
  issueId: string;
  limit?: number;
}

export interface ActivityItemProps {
  activity: IssueActivity;
  itemType?: string;
}

export interface ActivityIconProps {
  action: string;
  className?: string;
}

export interface ActivityChangeDetailsProps {
  activity: IssueActivity;
}

export interface ActivityTextProps {
  activity: IssueActivity;
  itemType?: string;
}

export type ActivityAction = 
  | 'CREATED'
  | 'UPDATED'
  | 'TITLE_UPDATED'
  | 'DESCRIPTION_UPDATED'
  | 'MOVED'
  | 'COLUMN_CHANGED'
  | 'STATUS_CHANGED'
  | 'PRIORITY_CHANGED'
  | 'ASSIGNED'
  | 'UNASSIGNED'
  | 'REPORTER_CHANGED'
  | 'DUE_DATE_SET'
  | 'DUE_DATE_CHANGED'
  | 'DUE_DATE_REMOVED'
  | 'LABELS_CHANGED'
  | 'STORY_POINTS_CHANGED'
  | 'TYPE_CHANGED'
  | 'COLOR_CHANGED'
  | 'TASK_PLAY_STARTED'
  | 'TASK_PLAY_STOPPED'
  | 'TASK_PLAY_PAUSED'
  | 'TIME_ADJUSTED'
  | 'SESSION_EDITED'
  | 'HELP_REQUEST_SENT'
  | 'HELP_REQUEST_APPROVED'
  | 'HELP_REQUEST_REJECTED';
