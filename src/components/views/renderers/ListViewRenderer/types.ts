export interface Issue {
    id: string;
    title: string;
    issueKey: string;
    type: string;
    priority: string;
    status: string;
    description?: string;
    dueDate?: string;
    createdAt: string;
    updatedAt: string;
    assignee?: {
        id: string;
        name: string;
        image?: string;
    };
    assigneeId?: string;
    reporter?: {
        id: string;
        name: string;
        image?: string;
    };
    parent?: {
        id: string;
        issueKey: string;
        title: string;
        type?: string;
        status?: string;
    };
    project?: {
        id: string;
        name: string;
        color?: string;
    };
    projectId?: string;
    labels?: Array<{
        id: string;
        name: string;
        color: string;
    }>;
    _count?: {
        comments?: number;
        children?: number;
    };
    // Additional fields that might be present
    projectStatus?: {
        name: string;
        displayName?: string;
    };
    statusValue?: string;
}

export interface ListViewRendererProps {
    view: any;
    issues: any[];
    workspace: any;
    currentUser: any;
    activeFilters?: Record<string, string[]>;
    setActiveFilters?: (filters: Record<string, string[]>) => void;
    onIssueUpdate?: (issueId: string, updates: any) => void;
    displayProperties?: string[];
    showSubIssues?: boolean;
}
