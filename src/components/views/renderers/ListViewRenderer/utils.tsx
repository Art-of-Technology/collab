import { Circle, Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getIssuePriorityBadge } from '@/utils/issueHelpers';

// Status normalization map - same as kanban to avoid duplicate columns
export const STATUS_NORMALIZATION_MAP: Record<string, string> = {
    'todo': 'Todo',
    'to do': 'Todo',
    'to_do': 'Todo',
    'ready': 'Todo',
    'backlog': 'Backlog',
    'in progress': 'In Progress',
    'in_progress': 'In Progress',
    'inprogress': 'In Progress',
    'active': 'In Progress',
    'working': 'In Progress',
    'doing': 'In Progress',
    'development': 'In Progress',
    'review': 'Review',
    'in review': 'Review',
    'in_review': 'Review',
    'reviewing': 'Review',
    'testing': 'Testing',
    'test': 'Testing',
    'qa': 'Testing',
    'done': 'Done',
    'completed': 'Done',
    'finished': 'Done',
    'resolved': 'Done',
    'closed': 'Done',
    'cancelled': 'Cancelled',
    'canceled': 'Cancelled',
    'rejected': 'Cancelled',
    'blocked': 'Blocked',
    'blocker': 'Blocked',
    'stuck': 'Blocked'
};

export const normalizeStatus = (status: string): string => {
    if (!status) return 'Todo';
    const normalized = STATUS_NORMALIZATION_MAP[status.toLowerCase()];
    return normalized || status;
};

// Column widths configuration
export const COLUMN_WIDTHS: Record<string, string> = {
    'Status': '36px',
    'ID': '60px',
    'Title': 'minmax(300px, 1fr)',
    'Priority': '36px',
    'Assignee': '44px',
    'Reporter': '44px',
    'Labels': '120px',
    'Project': '90px',
    'Due Date': '60px',
    'Due date': '60px',
    'Created': '60px',
    'Updated': '60px',
    'Comments': '50px',
    'Sub-issues': '50px'
};

export const getPriorityIcon = (priority: string) => {
    const priorityConfig = getIssuePriorityBadge(priority);
    const IconComponent = priorityConfig.icon;

    // Color mapping for better visibility
    const colorMap = {
        'URGENT': 'text-red-500',
        'HIGH': 'text-orange-500',
        'MEDIUM': 'text-blue-500',
        'LOW': 'text-green-500'
    };

    const colorClass = colorMap[priority as keyof typeof colorMap] || 'text-gray-500';

    return <IconComponent className={cn("h-3.5 w-3.5", colorClass)} />;
};

export const getStatusIcon = (status: string) => {
    const normalizedStatus = normalizeStatus(status).toLowerCase();
    const iconClass = "h-3.5 w-3.5";

    switch (normalizedStatus) {
        case 'todo':
            return <Circle className={cn(iconClass, "text-[#8b949e]")} />;
        case 'in progress':
            return <Clock className={cn(iconClass, "text-[#3b82f6]")} />;
        case 'review':
            return <Clock className={cn(iconClass, "text-[#f59e0b]")} />;
        case 'testing':
            return <Clock className={cn(iconClass, "text-[#8b5cf6]")} />;
        case 'done':
            return <CheckCircle2 className={cn(iconClass, "text-[#22c55e]")} fill="currentColor" />;
        case 'cancelled':
            return <XCircle className={cn(iconClass, "text-[#ef4444]")} fill="currentColor" />;
        case 'blocked':
            return <AlertCircle className={cn(iconClass, "text-[#f59e0b]")} />;
        default:
            return <Circle className={cn(iconClass, "text-[#8b949e]")} />;
    }
};
