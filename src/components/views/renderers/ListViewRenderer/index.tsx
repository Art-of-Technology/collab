"use client";

import { useMemo, useState, useCallback } from 'react';
import {
    Filter,
    ChevronDown,
    ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getIssuePriorityBadge } from '@/utils/issueHelpers';
import { IssueDetailModal } from '@/components/issue/IssueDetailModal';
import { ListViewRendererProps, Issue } from './types';
import { normalizeStatus, getStatusIcon, COLUMN_WIDTHS } from './utils';
import IssueRow from './IssueRow';
import { useIssueModalUrlState } from '@/hooks/useIssueModalUrlState';

export default function ListViewRenderer({
    view,
    issues,
    workspace,
    displayProperties = ['ID', 'Priority', 'Status', 'Assignee', 'Project', 'Due date'],
    showSubIssues = true
}: ListViewRendererProps) {
    // State management
    const {
        selectedIssueId,
        setSelectedIssueId,
        closeModal: handleCloseModal
    } = useIssueModalUrlState();

    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    const [selectedFilters, _setSelectedFilters] = useState<{
        assignees: string[];
        labels: string[];
        priority: string[];
        projects: string[];
    }>({
        assignees: [],
        labels: [],
        priority: [],
        projects: []
    });

    // Display settings - use props from parent (view.fields comes from tempDisplayProperties in ViewRenderer)
    const displaySettings = useMemo(() => ({
        grouping: view.grouping?.field || 'status',
        ordering: view.ordering || 'updated',
        displayProperties: (view.fields || displayProperties || ['ID', 'Labels', 'Priority', 'Project', 'Assignee']).sort((a: string, b: string) => {
            const order = ['Status', 'ID', 'Title', 'Labels', 'Project', 'Priority', 'Assignee', 'Reporter', 'Due Date', 'Created', 'Updated', 'Comments', 'Sub-issues'];
            const indexA = order.indexOf(a);
            const indexB = order.indexOf(b);
            return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
        }) as string[],
        showSubIssues: showSubIssues
    }), [view.grouping?.field, view.ordering, view.fields, displayProperties, showSubIssues]);

    // Generate grid template columns based on display properties
    const gridTemplateColumns = useMemo(() => {
        const props = displaySettings.displayProperties;
        let template = "";

        // Status is usually first if present
        if (props.includes('Status')) template += `${COLUMN_WIDTHS['Status']} `;
        if (props.includes('ID')) template += `${COLUMN_WIDTHS['ID']} `;

        // Title is always present and takes remaining space
        template += `${COLUMN_WIDTHS['Title']} `;

        // Other properties
        props.forEach(prop => {
            if (prop !== 'Status' && prop !== 'ID' && COLUMN_WIDTHS[prop]) {
                template += `${COLUMN_WIDTHS[prop]} `;
            }
        });

        return template.trim();
    }, [displaySettings.displayProperties]);



    // Filter and group issues
    const groupedIssues = useMemo(() => {
        let filtered = [...issues];

        // Apply filters
        if (selectedFilters.assignees.length > 0) {
            filtered = filtered.filter(issue => {
                const assigneeId = issue.assignee?.id || 'unassigned';
                return selectedFilters.assignees.includes(assigneeId);
            });
        }

        if (selectedFilters.labels.length > 0) {
            filtered = filtered.filter(issue => {
                if (!issue.labels || issue.labels.length === 0) {
                    return selectedFilters.labels.includes('no-labels');
                }
                return issue.labels.some((label: any) =>
                    selectedFilters.labels.includes(label.id)
                );
            });
        }

        if (selectedFilters.priority.length > 0) {
            filtered = filtered.filter(issue => {
                const priority = issue.priority || 'no-priority';
                return selectedFilters.priority.includes(priority);
            });
        }

        if (selectedFilters.projects.length > 0) {
            filtered = filtered.filter(issue => {
                const projectId = issue.project?.id || 'no-project';
                return selectedFilters.projects.includes(projectId);
            });
        }

        // Group issues
        const groups = new Map<string, { name: string; issues: Issue[]; count: number }>();

        filtered.forEach(issue => {
            let groupKey: string;
            let groupName: string;

            switch (displaySettings.grouping) {
                case 'status':
                    // Use projectStatus if available, otherwise fallback to legacy fields
                    if (issue.projectStatus?.name) {
                        groupKey = issue.projectStatus.name;
                        groupName = issue.projectStatus.displayName || issue.projectStatus.name;
                    } else {
                        groupKey = normalizeStatus(issue.statusValue || issue.status || 'Todo');
                        groupName = groupKey;
                    }
                    break;
                case 'priority':
                    groupKey = issue.priority || 'MEDIUM';
                    groupName = getIssuePriorityBadge(issue.priority).label;
                    break;
                case 'assignee':
                    groupKey = issue.assignee?.id || 'unassigned';
                    groupName = issue.assignee?.name || 'Unassigned';
                    break;
                case 'project':
                    groupKey = issue.project?.id || 'no-project';
                    groupName = issue.project?.name || 'No Project';
                    break;
                default:
                    groupKey = 'all';
                    groupName = 'All Issues';
            }

            if (!groups.has(groupKey)) {
                groups.set(groupKey, {
                    name: groupName,
                    issues: [],
                    count: 0
                });
            }

            groups.get(groupKey)!.issues.push(issue);
            groups.get(groupKey)!.count++;
        });

        // Sort issues within each group
        groups.forEach(group => {
            group.issues.sort((a, b) => {
                switch (displaySettings.ordering) {
                    case 'created':
                        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                    case 'updated':
                        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
                    case 'priority': {
                        const priorityOrder = { 'URGENT': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
                        const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] || 0;
                        const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] || 0;
                        return bPriority - aPriority;
                    }
                    case 'dueDate': {
                        const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
                        const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
                        return aDate - bDate;
                    }
                    default:
                        return a.title.localeCompare(b.title);
                }
            });
        });

        return Array.from(groups.values());
    }, [issues, selectedFilters, displaySettings]);

    // Handlers
    const handleGroupToggle = useCallback((groupKey: string) => {
        setCollapsedGroups(prev => {
            const newSet = new Set(prev);
            if (newSet.has(groupKey)) {
                newSet.delete(groupKey);
            } else {
                newSet.add(groupKey);
            }
            return newSet;
        });
    }, []);

    const handleIssueClick = useCallback((issueIdOrKey: string, event: React.MouseEvent) => {
        // For Ctrl/Cmd+click, allow default behavior (open in new tab)
        if (event.ctrlKey || event.metaKey) {
            return;
        }

        // For normal clicks, prevent default and open modal
        event.preventDefault();
        setSelectedIssueId(issueIdOrKey);
    }, [setSelectedIssueId]);

    // List Header Component
    const ListHeader = () => {
        return (
            <div
                className="hidden md:grid items-center gap-4 px-4 py-2.5 border-b border-collab-700 bg-collab-800/60 text-[11px] font-medium text-collab-400 uppercase tracking-wider sticky top-0 z-30"
                style={{ gridTemplateColumns }}
            >
                {displaySettings.displayProperties.includes('Status') && <div>Status</div>}
                {displaySettings.displayProperties.includes('ID') && <div>ID</div>}
                <div>Title</div>
                {displaySettings.displayProperties.map(prop => {
                    if (prop === 'Status' || prop === 'ID') return null;
                    if (!COLUMN_WIDTHS[prop]) return null;
                    return <div key={prop}>{prop}</div>;
                })}
            </div>
        );
    };

    // Group Header Component
    const GroupHeader = ({ group, groupKey }: { group: any; groupKey: string }) => {
        const isCollapsed = collapsedGroups.has(groupKey);

        return (
            <div
                className={cn(
                    "sticky z-20 cursor-pointer transition-colors",
                    "bg-collab-900/80 border-b border-collab-700",
                    "md:top-[37px]"
                )}
                onClick={() => handleGroupToggle(groupKey)}
            >
                <div className={cn(
                    "flex items-center gap-2 py-2 transition-colors",
                    "px-4 hover:bg-collab-800"
                )}>
                    {isCollapsed ? (
                        <ChevronRight className="h-3.5 w-3.5 text-collab-400" />
                    ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-collab-400" />
                    )}
                    <div className="flex items-center gap-2">
                        {displaySettings.grouping === 'status' && getStatusIcon(group.name)}
                        <span className="text-xs font-medium uppercase tracking-wider text-collab-400">{group.name}</span>
                        <span className="text-collab-600 text-[10px]">{group.count}</span>
                    </div>
                </div>
            </div>
        );
    };

    const totalIssues = issues.length;

    return (
        <>
            <div className="h-full flex flex-col overflow-y-auto">
                {totalIssues === 0 ? (
                    <div className="py-12 text-center">
                        <div
                            className="w-full max-w-xs mx-auto h-16 rounded-lg mb-3"
                            style={{
                                backgroundImage: "radial-gradient(circle, #1f1f22 1px, transparent 1px)",
                                backgroundSize: "8px 8px",
                            }}
                        />
                        <p className="text-xs text-collab-500">No issues match your filters</p>
                    </div>
                ) : (
                    <div className="pb-20 md:pb-16">
                        <ListHeader />
                        {groupedIssues.map((group, index) => {
                            const groupKey = `${displaySettings.grouping}-${group.name}`;
                            const isCollapsed = collapsedGroups.has(groupKey);

                            return (
                                <div key={groupKey}>
                                    <GroupHeader group={group} groupKey={groupKey} />
                                    {!isCollapsed && (
                                        <div className="mt-2 md:mt-0">
                                            {group.issues.map((issue) => (
                                                <IssueRow
                                                    key={issue.id}
                                                    issue={issue}
                                                    displaySettings={displaySettings}
                                                    gridTemplateColumns={gridTemplateColumns}
                                                    workspace={workspace}
                                                    view={view}
                                                    handleIssueClick={handleIssueClick}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {selectedIssueId && (
                <IssueDetailModal
                    issueId={selectedIssueId}
                    onClose={handleCloseModal}
                />
            )}
        </>
    );
}
