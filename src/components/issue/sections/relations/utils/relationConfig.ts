import type { RelationConfig, IssueRelationType } from "../types/relation";

export const RELATION_CONFIGS: Record<IssueRelationType, RelationConfig> = {
    parent: {
        type: 'parent',
        label: 'Parent Issue',
        description: 'This issue is a child of another issue',
        icon: 'arrow-up',
        color: 'blue',
        canHaveMultiple: false,
        searchPlaceholder: 'Search for parent issue...'
    },
    child: {
        type: 'child',
        label: 'Sub-issues',
        description: 'This issue is a parent of another issue',
        icon: 'arrow-down',
        color: 'green',
        canHaveMultiple: true,
        searchPlaceholder: 'Search for sub-issues...'
    },
    blocks: {
        type: 'blocks',
        label: 'Blocks',
        description: 'Issues blocked by this issue',
        icon: 'shield',
        color: 'red',
        canHaveMultiple: true,
        searchPlaceholder: 'Search for issues to block...'
    },
    blocked_by: {
        type: 'blocked_by',
        label: 'Blocked by',
        description: 'Issues blocking this issue',
        icon: 'shield-alert',
        color: 'orange',
        canHaveMultiple: true,
        searchPlaceholder: 'Search for blocking issues...'
    },
    relates_to: {
        type: 'relates_to',
        label: 'Related',
        description: 'Issues related to this issue',
        icon: 'link',
        color: 'purple',
        canHaveMultiple: true,
        searchPlaceholder: 'Search for related issues...'
    },
    duplicates: {
        type: 'duplicates',
        label: 'Duplicates',
        description: 'Issues duplicated by this issue',
        icon: 'copy',
        color: 'gray',
        canHaveMultiple: true,
        searchPlaceholder: 'Search for duplicate issues...'
    },
    duplicated_by: {
        type: 'duplicated_by',
        label: 'Duplicated by',
        description: 'Issues that duplicate this issue',
        icon: 'copy',
        color: 'gray',
        canHaveMultiple: true,
        searchPlaceholder: 'Search for duplicating issues...'
    }
};

/**
 * Get relation configuration by type
 */
export function getRelationConfig(type: IssueRelationType | null): RelationConfig {
    if (!type) return {
        type: 'relates_to',
        label: 'Related Issues',
        description: 'Find related issues and choose the relation type',
        icon: 'link',
        color: 'gray',
        canHaveMultiple: true,
        searchPlaceholder: 'Search for related issues...'
    }
    return RELATION_CONFIGS[type];
}

/**
 * Get URL for a related item
 */
export function getRelationItemUrl(item: any, workspaceSlug: string): string {
    // For issues, use the issueKey-based URL format
    if (item.issueKey) {
        return `/${workspaceSlug}/issues/${item.issueKey}`;
    }

    // For legacy items (epics, stories, etc), use their specific paths
    const baseUrl = `/${workspaceSlug}/views`;
    return `${baseUrl}/${item.id}`;
}

/**
 * Get display count text for a relation group
 */
export function getRelationCountText(type: IssueRelationType, count: number): string {
    const config = getRelationConfig(type);

    if (count === 0) return '';
    if (!config.canHaveMultiple) return '';

    return `${count}`;
}

/**
 * Check if a relation type supports multiple items
 */
export function canHaveMultipleRelations(type: IssueRelationType): boolean {
    return getRelationConfig(type).canHaveMultiple;
}
