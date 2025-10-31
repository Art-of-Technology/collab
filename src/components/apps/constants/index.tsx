import { AppScope } from "@/lib/apps/types";

export const SCOPE_DESCRIPTIONS: Record<AppScope, { label: string; description: string; level: 'low' | 'medium' | 'high' }> = {
  'comments:read': {
    label: 'Read comments',
    description: 'View comments on issues and tasks',
    level: 'medium'
  },
  'comments:write': {
    label: 'Create and modify comments',
    description: 'Create and modify comments on issues and tasks on your behalf',
    level: 'high'
  },
  'issues:read': {
    label: 'Read issues',
    description: 'View issues, comments, and related data',
    level: 'medium'
  },
  'issues:write': {
    label: 'Create and modify issues',
    description: 'Create, update, and manage issues on your behalf',
    level: 'high'
  },
  'leave:read': {
    label: 'Read leaves',
    description: 'View leaves and related data',
    level: 'medium'
  },
  'leave:write': {
    label: 'Create and modify leaves',
    description: 'Create, update, and manage leaves on your behalf',
    level: 'high'
  },
  'posts:read': {
    label: 'Read posts',
    description: 'View posts and related data',
    level: 'medium'
  },
  'posts:write': {
    label: 'Create and modify posts',
    description: 'Create, update, and manage posts on your behalf',
    level: 'high'
  },
  'profile:read': {
    label: 'Read user profile',
    description: 'Access your name, email, and profile information',
    level: 'low'
  },
  'profile:write': {
    label: 'Modify user profile',
    description: 'Modify your profile information on your behalf',
    level: 'high'
  },
  'user:read': {
    label: 'Read user profile (legacy)',
    description: 'Access your name, email, and profile information (legacy scope)',
    level: 'low'
  },
  'user:write': {
    label: 'Modify user profile (legacy)',
    description: 'Modify your profile information on your behalf (legacy scope)',
    level: 'high'
  },
  'workspace:read': {
    label: 'Read workspace information',
    description: 'Access workspace name, settings, and basic information',
    level: 'low'
  },
  'workspace:write': {
    label: 'Modify workspace settings',
    description: 'Change workspace settings and configuration on your behalf',
    level: 'high'
  }
};