import React, { memo } from 'react';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, ArrowRight, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ParentIssueBadge, ParentIssueBadgeMinimal } from '@/components/issue/ParentIssueBadge';
import { Issue } from './types';
import { getPriorityIcon, getStatusIcon, normalizeStatus, COLUMN_WIDTHS } from './utils';

interface IssueRowProps {
    issue: Issue;
    displaySettings: {
        displayProperties: string[];
        grouping: string;
    };
    gridTemplateColumns: string;
    workspace: any;
    view: any;
    handleIssueClick: (issueIdOrKey: string, event: React.MouseEvent) => void;
}

const IssueRow = memo(({ issue, displaySettings, gridTemplateColumns, workspace, view, handleIssueClick }: IssueRowProps) => {
    // Build URL for the issue
    const issueIdOrKey = issue.issueKey || issue.id;
    const workspaceSegment = (workspace as any)?.slug || (workspace as any)?.id || (view as any)?.workspaceId || (issue as any)?.workspaceId;
    const viewParams = view?.slug ? `?view=${view.slug}&viewName=${encodeURIComponent(view.name)}` : '';
    const issueUrl = workspaceSegment
        ? `/${workspaceSegment}/issues/${issueIdOrKey}${viewParams}`
        : `/issues/${issueIdOrKey}${viewParams}`;

    return (
        <Link
            href={issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
                "group relative cursor-pointer transition-all duration-200 block",
                // Mobile-first: Card-like design with glassmorphism
                "mx-3 mb-3 p-4 rounded-xl",
                "bg-white/5 hover:bg-white/10 backdrop-blur-sm",
                "border border-white/10 hover:border-white/20",
                // Desktop: More compact list style
                "md:mx-0 md:mb-0 md:p-2 md:rounded-lg md:border-0 md:border-b md:border-[#1f1f1f]",
                "md:bg-transparent md:hover:bg-[#0f1011] md:backdrop-blur-none md:hover:border-[#333]"
            )}
            onClick={(e) => handleIssueClick(issue.issueKey || issue.id, e)}
        >
            {/* Mobile Layout */}
            <div className="md:hidden">
                <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        {/* Status Icon */}
                        {displaySettings.displayProperties.includes('Status') && (
                            <div className="flex items-center shrink-0">
                                {getStatusIcon(issue.status)}
                            </div>
                        )}

                        {/* Priority Icon */}
                        {displaySettings.displayProperties.includes('Priority') && issue.priority && (
                            <div className="flex items-center shrink-0">
                                {getPriorityIcon(issue.priority)}
                            </div>
                        )}

                        {/* Issue Key */}
                        {displaySettings.displayProperties.includes('ID') && (
                            <span className="text-gray-400 text-xs font-mono font-medium shrink-0">
                                {issue.issueKey}
                            </span>
                        )}

                        {/* Assignee Avatar */}
                        {displaySettings.displayProperties.includes('Assignee') && (
                            <div className="flex items-center shrink-0 ml-auto">
                                {issue.assignee ? (
                                    <Avatar className="h-5 w-5">
                                        <AvatarImage src={issue.assignee.image} />
                                        <AvatarFallback className="text-xs bg-[#2a2a2a] text-white border-none">
                                            {issue.assignee.name?.charAt(0)?.toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                ) : (
                                    <div className="h-5 w-5 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center">
                                        <User className="h-2.5 w-2.5 text-[#666]" />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Title */}
                <h3 className="text-white text-sm font-medium mb-2 line-clamp-2">
                    {issue.title}
                </h3>

                {/* Parent Issue Badge */}
                {issue.parent && (
                    <div className="mb-2">
                        <ParentIssueBadge
                            parent={issue.parent}
                            workspaceSlug={workspaceSegment}
                            asButton={true}
                        />
                    </div>
                )}

                {/* Labels */}
                {displaySettings.displayProperties.includes('Labels') && issue.labels && issue.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                        {issue.labels.slice(0, 3).map((label) => (
                            <Badge
                                key={label.id}
                                className="h-5 px-2 text-xs font-medium leading-none border-0 rounded-sm"
                                style={{
                                    backgroundColor: label.color + '20',
                                    color: label.color || '#8b949e'
                                }}
                            >
                                {label.name}
                            </Badge>
                        ))}
                        {issue.labels.length > 3 && (
                            <span className="text-xs text-gray-500 px-1">+{issue.labels.length - 3}</span>
                        )}
                    </div>
                )}

                {/* Meta badges row */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Project Badge */}
                        {displaySettings.displayProperties.includes('Project') && issue.project && (
                            <Badge
                                className="h-5 px-2 text-xs font-medium leading-none border-0 rounded-md"
                                style={{
                                    backgroundColor: (issue.project.color || '#6e7681') + '30',
                                    color: issue.project.color || '#8b949e'
                                }}
                            >
                                {issue.project.name}
                            </Badge>
                        )}

                        {/* Status (text badge) */}
                        {displaySettings.displayProperties.includes('Status') && issue.status && (
                            <Badge className="h-5 px-2 text-xs font-medium leading-none bg-white/10 text-gray-300 border-0 rounded-md">
                                {normalizeStatus(issue.status)}
                            </Badge>
                        )}

                        {/* Due Date */}
                        {(displaySettings.displayProperties.includes('Due Date') || displaySettings.displayProperties.includes('Due date')) && issue.dueDate && (
                            <Badge className="h-5 px-2 text-xs font-medium leading-none bg-orange-500/30 text-orange-400 border-0 rounded-md">
                                {format(new Date(issue.dueDate), 'MMM d')}
                            </Badge>
                        )}

                        {/* Reporter */}
                        {displaySettings.displayProperties.includes('Reporter') && (
                            <div className="flex items-center">
                                {issue.reporter ? (
                                    <Avatar className="h-5 w-5">
                                        <AvatarImage src={issue.reporter.image} />
                                        <AvatarFallback className="text-xs bg-[#2a2a2a] text-white border-none">
                                            {issue.reporter.name?.charAt(0)?.toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                ) : (
                                    <div className="h-5 w-5 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center">
                                        <User className="h-2.5 w-2.5 text-[#666]" />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Comments Meta */}
                        {displaySettings.displayProperties.includes('Comments') && (
                            <div className="flex items-center gap-1 px-2 py-1 bg-gray-500/20 text-gray-400 rounded-md">
                                <MessageSquare className="h-3 w-3" />
                                <span className="text-xs font-medium">{issue._count?.comments || 0}</span>
                            </div>
                        )}

                        {/* Sub-issues Meta */}
                        {displaySettings.displayProperties.includes('Sub-issues') && (
                            <div className="flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-400 rounded-md">
                                <ArrowRight className="h-3 w-3" />
                                <span className="text-xs font-medium">{issue._count?.children || 0}</span>
                            </div>
                        )}
                    </div>

                    {/* Created / Updated Dates */}
                    <div className="flex items-center gap-2">
                        {displaySettings.displayProperties.includes('Created') && (
                            <span className="text-gray-500 text-xs">
                                {format(new Date(issue.createdAt), 'MMM d')}
                            </span>
                        )}
                        {displaySettings.displayProperties.includes('Updated') && (
                            <span className="text-gray-500 text-xs">
                                {format(new Date(issue.updatedAt), 'MMM d')}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Desktop Layout - Grid structure */}
            <div
                className="hidden md:grid items-center gap-4"
                style={{ gridTemplateColumns }}
            >
                {/* Status Icon */}
                {displaySettings.displayProperties.includes('Status') && (
                    <div className="flex items-center">
                        {getStatusIcon(issue.status)}
                    </div>
                )}

                {/* Issue Key */}
                {displaySettings.displayProperties.includes('ID') && (
                    <div className="flex items-center">
                        <span className="text-[#8b949e] text-xs font-mono font-medium truncate">
                            {issue.issueKey}
                        </span>
                    </div>
                )}

                {/* Title */}
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[#e6edf3] text-sm font-medium truncate group-hover:text-[#58a6ff] transition-colors">
                        {issue.title}
                    </span>
                    {issue.parent && (
                        <ParentIssueBadgeMinimal
                            parent={issue.parent}
                            workspaceSlug={workspaceSegment}
                            className="flex-shrink-0"
                            asButton={true}
                        />
                    )}
                </div>

                {/* Other Columns */}
                {displaySettings.displayProperties.map(prop => {
                    if (prop === 'Status' || prop === 'ID') return null;

                    switch (prop) {
                        case 'Priority':
                            return (
                                <div key={prop} className="flex items-center">
                                    {issue.priority && getPriorityIcon(issue.priority)}
                                </div>
                            );

                        case 'Assignee':
                            return (
                                <div key={prop} className="flex items-center">
                                    {issue.assignee ? (
                                        <Avatar className="h-5 w-5">
                                            <AvatarImage src={issue.assignee.image} />
                                            <AvatarFallback className="text-[10px] bg-[#2a2a2a] text-white border-none">
                                                {issue.assignee.name?.charAt(0)?.toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                    ) : (
                                        <div className="h-5 w-5 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center">
                                            <User className="h-2.5 w-2.5 text-[#666]" />
                                        </div>
                                    )}
                                </div>
                            );

                        case 'Labels':
                            return (
                                <div key={prop} className="flex items-center gap-1 overflow-hidden">
                                    {issue.labels && issue.labels.length > 0 && (
                                        <>
                                            {issue.labels.slice(0, 2).map((label) => (
                                                <Badge
                                                    key={label.id}
                                                    className="h-4 px-1.5 text-[10px] font-medium leading-none border-0 rounded-sm whitespace-nowrap"
                                                    style={{
                                                        backgroundColor: label.color + '20',
                                                        color: label.color || '#8b949e'
                                                    }}
                                                >
                                                    {label.name}
                                                </Badge>
                                            ))}
                                            {issue.labels.length > 2 && (
                                                <span className="text-[10px] text-[#6e7681] px-1">+{issue.labels.length - 2}</span>
                                            )}
                                        </>
                                    )}
                                </div>
                            );

                        case 'Project':
                            return (
                                <div key={prop} className="flex items-center overflow-hidden">
                                    {issue.project && (
                                        <Badge
                                            className="h-5 px-2 text-[10px] font-medium leading-none border-0 rounded-md bg-opacity-80 hover:bg-opacity-100 transition-all truncate"
                                            style={{
                                                backgroundColor: (issue.project.color || '#6e7681') + '30',
                                                color: issue.project.color || '#8b949e'
                                            }}
                                        >
                                            {issue.project.name}
                                        </Badge>
                                    )}
                                </div>
                            );

                        case 'Due Date':
                        case 'Due date':
                            return (
                                <div key={prop} className="flex items-center">
                                    {issue.dueDate && (
                                        <span className="text-[#8b949e] text-xs">
                                            {format(new Date(issue.dueDate), 'MMM d')}
                                        </span>
                                    )}
                                </div>
                            );

                        case 'Reporter':
                            return (
                                <div key={prop} className="flex items-center">
                                    {issue.reporter ? (
                                        <Avatar className="h-5 w-5">
                                            <AvatarImage src={issue.reporter.image} />
                                            <AvatarFallback className="text-[10px] bg-[#2a2a2a] text-white border-none">
                                                {issue.reporter.name?.charAt(0)?.toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                    ) : (
                                        <div className="h-5 w-5 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center">
                                            <User className="h-2.5 w-2.5 text-[#666]" />
                                        </div>
                                    )}
                                </div>
                            );

                        case 'Created':
                            return (
                                <div key={prop} className="flex items-center">
                                    <span className="text-[#6e7681] text-xs">
                                        {format(new Date(issue.createdAt), 'MMM d')}
                                    </span>
                                </div>
                            );

                        case 'Updated':
                            return (
                                <div key={prop} className="flex items-center">
                                    <span className="text-[#6e7681] text-xs">
                                        {format(new Date(issue.updatedAt), 'MMM d')}
                                    </span>
                                </div>
                            );

                        case 'Comments':
                            return (
                                <div key={prop} className="flex items-center">
                                    {issue._count?.comments ? (
                                        <div className="flex items-center gap-1 text-[#8b949e]">
                                            <MessageSquare className="h-3 w-3" />
                                            <span className="text-xs">{issue._count.comments}</span>
                                        </div>
                                    ) : null}
                                </div>
                            );

                        case 'Sub-issues':
                            return (
                                <div key={prop} className="flex items-center">
                                    {issue._count?.children ? (
                                        <div className="flex items-center gap-1 text-[#8b949e]">
                                            <ArrowRight className="h-3 w-3" />
                                            <span className="text-xs">{issue._count.children}</span>
                                        </div>
                                    ) : null}
                                </div>
                            );

                        default:
                            return <div key={prop} />;
                    }
                })}
            </div>
        </Link>
    );
});

IssueRow.displayName = 'IssueRow';

export default IssueRow;
