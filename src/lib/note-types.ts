import { NoteType, NoteScope, NoteSharePermission } from '@prisma/client';
import {
  FileText,
  Bot,
  BookOpen,
  FileText as ReadmeIcon,
  Code,
  Paintbrush,
  Building2,
  FileCode,
  ScrollText,
  AlertTriangle,
  Users,
  Scale,
  Lock,
  Share2,
  FolderKanban,
  Globe,
  Eye,
  type LucideIcon,
} from 'lucide-react';

// Note Type Configuration
export interface NoteTypeConfig {
  value: NoteType;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  defaultScope: NoteScope;
  supportsAiContext: boolean;
  suggestedCategories?: string[];
}

export const NOTE_TYPE_CONFIGS: Record<NoteType, NoteTypeConfig> = {
  [NoteType.GENERAL]: {
    value: NoteType.GENERAL,
    label: 'General',
    description: 'General purpose notes for any content',
    icon: FileText,
    color: 'text-slate-600',
    bgColor: 'bg-slate-100',
    defaultScope: NoteScope.PERSONAL,
    supportsAiContext: false,
  },
  [NoteType.SYSTEM_PROMPT]: {
    value: NoteType.SYSTEM_PROMPT,
    label: 'System Prompt',
    description: 'AI system prompts for workspace or project context',
    icon: Bot,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
    defaultScope: NoteScope.WORKSPACE,
    supportsAiContext: true,
    suggestedCategories: ['ai/prompts', 'ai/context'],
  },
  [NoteType.GUIDE]: {
    value: NoteType.GUIDE,
    label: 'Guide',
    description: 'How-to guides and tutorials',
    icon: BookOpen,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    defaultScope: NoteScope.WORKSPACE,
    supportsAiContext: true,
    suggestedCategories: ['guides/getting-started', 'guides/advanced', 'guides/troubleshooting'],
  },
  [NoteType.README]: {
    value: NoteType.README,
    label: 'README',
    description: 'Project or workspace documentation',
    icon: ReadmeIcon,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    defaultScope: NoteScope.WORKSPACE,
    supportsAiContext: true,
    suggestedCategories: ['readme'],
  },
  [NoteType.TECH_STACK]: {
    value: NoteType.TECH_STACK,
    label: 'Tech Stack',
    description: 'Technology stack documentation',
    icon: Code,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
    defaultScope: NoteScope.WORKSPACE,
    supportsAiContext: true,
    suggestedCategories: ['tech/frontend', 'tech/backend', 'tech/infrastructure', 'tech/tools'],
  },
  [NoteType.CODING_STYLE]: {
    value: NoteType.CODING_STYLE,
    label: 'Coding Style',
    description: 'Coding conventions and style guidelines',
    icon: Paintbrush,
    color: 'text-pink-600',
    bgColor: 'bg-pink-100',
    defaultScope: NoteScope.WORKSPACE,
    supportsAiContext: true,
    suggestedCategories: ['style/general', 'style/typescript', 'style/react', 'style/css'],
  },
  [NoteType.ARCHITECTURE]: {
    value: NoteType.ARCHITECTURE,
    label: 'Architecture',
    description: 'System architecture documentation',
    icon: Building2,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100',
    defaultScope: NoteScope.WORKSPACE,
    supportsAiContext: true,
    suggestedCategories: ['architecture/overview', 'architecture/components', 'architecture/data-flow'],
  },
  [NoteType.API_DOCS]: {
    value: NoteType.API_DOCS,
    label: 'API Documentation',
    description: 'API endpoint documentation',
    icon: FileCode,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-100',
    defaultScope: NoteScope.WORKSPACE,
    supportsAiContext: true,
    suggestedCategories: ['api/rest', 'api/graphql', 'api/webhooks'],
  },
  [NoteType.RUNBOOK]: {
    value: NoteType.RUNBOOK,
    label: 'Runbook',
    description: 'Operational runbooks and procedures',
    icon: ScrollText,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
    defaultScope: NoteScope.WORKSPACE,
    supportsAiContext: true,
    suggestedCategories: ['runbook/deployment', 'runbook/monitoring', 'runbook/incident-response'],
  },
  [NoteType.TROUBLESHOOT]: {
    value: NoteType.TROUBLESHOOT,
    label: 'Troubleshooting',
    description: 'Troubleshooting guides and known issues',
    icon: AlertTriangle,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    defaultScope: NoteScope.WORKSPACE,
    supportsAiContext: true,
    suggestedCategories: ['troubleshoot/common-issues', 'troubleshoot/errors', 'troubleshoot/debugging'],
  },
  [NoteType.MEETING]: {
    value: NoteType.MEETING,
    label: 'Meeting Notes',
    description: 'Meeting notes and action items',
    icon: Users,
    color: 'text-teal-600',
    bgColor: 'bg-teal-100',
    defaultScope: NoteScope.WORKSPACE,
    supportsAiContext: false,
    suggestedCategories: ['meetings/standup', 'meetings/planning', 'meetings/retrospective'],
  },
  [NoteType.DECISION]: {
    value: NoteType.DECISION,
    label: 'Decision Record',
    description: 'Architecture Decision Records (ADRs)',
    icon: Scale,
    color: 'text-violet-600',
    bgColor: 'bg-violet-100',
    defaultScope: NoteScope.WORKSPACE,
    supportsAiContext: true,
    suggestedCategories: ['decisions/accepted', 'decisions/proposed', 'decisions/superseded'],
  },
};

// Note Scope Configuration
export interface NoteScopeConfig {
  value: NoteScope;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
}

export const NOTE_SCOPE_CONFIGS: Record<NoteScope, NoteScopeConfig> = {
  [NoteScope.PERSONAL]: {
    value: NoteScope.PERSONAL,
    label: 'Personal',
    description: 'Only visible to you (can be shared with specific users)',
    icon: Lock,
    color: 'text-slate-600',
    bgColor: 'bg-slate-100',
  },
  [NoteScope.SHARED]: {
    value: NoteScope.SHARED,
    label: 'Shared',
    description: 'Deprecated - use Personal with shares',
    icon: Share2,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  [NoteScope.PROJECT]: {
    value: NoteScope.PROJECT,
    label: 'Project',
    description: 'Visible to all project members',
    icon: FolderKanban,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  [NoteScope.WORKSPACE]: {
    value: NoteScope.WORKSPACE,
    label: 'Workspace',
    description: 'Visible to all workspace members',
    icon: Users,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  [NoteScope.PUBLIC]: {
    value: NoteScope.PUBLIC,
    label: 'Public',
    description: 'Publicly accessible outside the workspace',
    icon: Globe,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
  },
};

// Note Share Permission Configuration
export interface NoteSharePermissionConfig {
  value: NoteSharePermission;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const NOTE_SHARE_PERMISSION_CONFIGS: Record<NoteSharePermission, NoteSharePermissionConfig> = {
  [NoteSharePermission.READ]: {
    value: NoteSharePermission.READ,
    label: 'Read Only',
    description: 'Can view but not edit',
    icon: Eye,
  },
  [NoteSharePermission.EDIT]: {
    value: NoteSharePermission.EDIT,
    label: 'Can Edit',
    description: 'Can view and edit',
    icon: FileText,
  },
};

// Helper functions
export function getNoteTypeConfig(type: NoteType): NoteTypeConfig {
  return NOTE_TYPE_CONFIGS[type];
}

export function getNoteScopeConfig(scope: NoteScope): NoteScopeConfig {
  return NOTE_SCOPE_CONFIGS[scope];
}

export function getNoteSharePermissionConfig(permission: NoteSharePermission): NoteSharePermissionConfig {
  return NOTE_SHARE_PERMISSION_CONFIGS[permission];
}

// Get all note types as array (for selects)
export function getNoteTypeOptions(): NoteTypeConfig[] {
  return Object.values(NOTE_TYPE_CONFIGS);
}

// Get all scopes as array (excluding deprecated SHARED)
export function getNoteScopeOptions(): NoteScopeConfig[] {
  return Object.values(NOTE_SCOPE_CONFIGS).filter(scope => scope.value !== NoteScope.SHARED);
}

// Get all share permissions as array
export function getNoteSharePermissionOptions(): NoteSharePermissionConfig[] {
  return Object.values(NOTE_SHARE_PERMISSION_CONFIGS);
}

// Get AI-context-eligible note types
export function getAiContextNoteTypes(): NoteTypeConfig[] {
  return Object.values(NOTE_TYPE_CONFIGS).filter(config => config.supportsAiContext);
}

// Check if a note type supports AI context
export function supportsAiContext(type: NoteType): boolean {
  return NOTE_TYPE_CONFIGS[type].supportsAiContext;
}

// Get suggested categories for a note type
export function getSuggestedCategories(type: NoteType): string[] {
  return NOTE_TYPE_CONFIGS[type].suggestedCategories || [];
}

// Parse category path into parts
export function parseCategoryPath(category: string | null): string[] {
  if (!category) return [];
  return category.split('/').filter(Boolean);
}

// Build category path from parts
export function buildCategoryPath(parts: string[]): string {
  return parts.filter(Boolean).join('/');
}
