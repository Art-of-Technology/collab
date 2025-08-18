export interface DefaultProjectStatus {
  name: string;          // Internal name (database)
  displayName: string;   // User-facing name (UI)
  color: string;
  order: number;
  isDefault: boolean;
  isFinal?: boolean;
}

/**
 * Standard project statuses that are created by default for all new projects.
 * These ensure consistency across the application and prevent naming variations
 * like "To Do" vs "Todo" vs "to-do".
 * 
 * Workflow: Backlog → To Do → In Progress → In Review → Done
 */
export const DEFAULT_PROJECT_STATUSES: DefaultProjectStatus[] = [
  {
    name: 'backlog',
    displayName: 'Backlog',
    color: '#8b949e',
    order: 0,
    isDefault: true,
    isFinal: false
  },
  {
    name: 'todo',
    displayName: 'To Do',
    color: '#6b7280',
    order: 1,
    isDefault: false,
    isFinal: false
  },
  {
    name: 'in_progress',
    displayName: 'In Progress',
    color: '#3b82f6',
    order: 2,
    isDefault: false,
    isFinal: false
  },
  {
    name: 'in_review',
    displayName: 'In Review',
    color: '#f59e0b',
    order: 3,
    isDefault: false,
    isFinal: false
  },
  {
    name: 'done',
    displayName: 'Done',
    color: '#10b981',
    order: 4,
    isDefault: true,
    isFinal: true
  }
];

/**
 * Generate internal name from display name.
 * Used when creating custom statuses to ensure consistent naming.
 */
export function generateInternalStatusName(displayName: string): string {
  return displayName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, '_');       // Replace spaces with underscores
}

/**
 * Validate status name to prevent naming conflicts and inconsistencies.
 */
export function validateStatusDisplayName(displayName: string): { valid: boolean; error?: string } {
  if (!displayName.trim()) {
    return { valid: false, error: 'Status name cannot be empty' };
  }
  
  if (displayName.length > 50) {
    return { valid: false, error: 'Status name cannot exceed 50 characters' };
  }
  
  // Prevent common variations that could cause confusion
  const normalizedName = displayName.toLowerCase().replace(/[^a-z]/g, '');
  const forbiddenVariations = [
    'backlog',
    'todo',
    'inprogress', 
    'inreview',
    'done',
    'complete',
    'completed',
    'finished'
  ];
  
  if (forbiddenVariations.includes(normalizedName)) {
    const standardStatus = DEFAULT_PROJECT_STATUSES.find(s => 
      s.name.replace(/_/g, '') === normalizedName
    );
    if (standardStatus) {
      return { 
        valid: false, 
        error: `Use the standard "${standardStatus.displayName}" status instead` 
      };
    }
  }
  
  return { valid: true };
}
