import React from 'react'
import { cn } from '@/lib/utils'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Badge } from '@/components/ui/badge'
import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IssueListItemIssue {
  id: string
  title: string
  issueKey?: string
  status?: string
  priority?: string
  assignee?: { name?: string | null; image?: string | null } | null
  labels?: Array<{ id: string; name: string; color?: string }>
  dueDate?: string
  project?: { name: string; color?: string }
}

export interface IssueListItemProps {
  issue: IssueListItemIssue
  /** Visual variant */
  variant?: 'default' | 'completed' | 'blocked' | 'danger' | 'warning'
  /** Show issue key (e.g. PROJ-123) */
  showKey?: boolean
  /** Show priority indicator dot */
  showPriority?: boolean
  /** Show assignee avatar */
  showAssignee?: boolean
  /** Show label badges */
  showLabels?: boolean
  /** Custom right-side content (e.g. days active, timestamps) */
  extra?: React.ReactNode
  /** Click handler */
  onClick?: (e: React.MouseEvent) => void
  /** Link href — renders as <a> if provided */
  href?: string
  className?: string
}

// ---------------------------------------------------------------------------
// Priority colors
// ---------------------------------------------------------------------------

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: 'bg-red-500',
  HIGH: 'bg-amber-500',
  MEDIUM: 'bg-blue-500',
  LOW: 'bg-slate-500',
}

// ---------------------------------------------------------------------------
// Variant config
// ---------------------------------------------------------------------------

const VARIANT_CONFIG = {
  default: {
    container: 'hover:bg-collab-800',
    titleClass: 'text-collab-50',
    icon: null,
  },
  completed: {
    container: 'hover:bg-collab-800',
    titleClass: 'text-collab-400 line-through decoration-collab-500/60',
    icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />,
  },
  blocked: {
    container: 'hover:bg-red-500/5',
    titleClass: 'text-collab-50',
    icon: <AlertTriangle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />,
  },
  danger: {
    container: 'hover:bg-collab-800',
    titleClass: 'text-collab-50',
    icon: null,
  },
  warning: {
    container: 'hover:bg-collab-800',
    titleClass: 'text-collab-50',
    icon: null,
  },
} as const

const INDICATOR_COLORS = {
  default: 'bg-blue-400',
  completed: 'bg-emerald-500',
  blocked: 'bg-red-400',
  danger: 'bg-red-400',
  warning: 'bg-amber-400',
} as const

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IssueListItem({
  issue,
  variant = 'default',
  showKey = true,
  showPriority = false,
  showAssignee = false,
  showLabels = false,
  extra,
  onClick,
  href,
  className,
}: IssueListItemProps) {
  const config = VARIANT_CONFIG[variant]

  const content = (
    <>
      {/* Priority dot or variant icon */}
      {config.icon ? (
        config.icon
      ) : showPriority && issue.priority ? (
        <div className={cn(
          'w-2 h-2 rounded-full flex-shrink-0',
          PRIORITY_COLORS[issue.priority] || 'bg-collab-500'
        )} />
      ) : (
        <div className={cn(
          'w-1 h-6 rounded-full flex-shrink-0',
          INDICATOR_COLORS[variant]
        )} />
      )}

      {/* Issue key */}
      {showKey && issue.issueKey && (
        <span className="text-collab-500 text-xs font-mono flex-shrink-0">
          {issue.issueKey}
        </span>
      )}

      {/* Title */}
      <span className={cn('flex-1 text-[13px] truncate', config.titleClass)}>
        {issue.title}
      </span>

      {/* Labels */}
      {showLabels && issue.labels && issue.labels.length > 0 && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {issue.labels.slice(0, 2).map((label) => (
            <Badge
              key={label.id}
              className="h-4 px-1.5 text-[10px] font-medium leading-none border-0 rounded-sm"
              style={{
                backgroundColor: (label.color || '#6e7681') + '20',
                color: label.color || undefined,
              }}
            >
              {label.name}
            </Badge>
          ))}
          {issue.labels.length > 2 && (
            <span className="text-[10px] text-collab-500">+{issue.labels.length - 2}</span>
          )}
        </div>
      )}

      {/* Extra content (days active, timestamps, etc.) */}
      {extra}

      {/* Assignee avatar */}
      {showAssignee && (
        <UserAvatar user={issue.assignee} size="sm" className="flex-shrink-0" />
      )}
    </>
  )

  const containerClass = cn(
    'group flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors',
    config.container,
    className
  )

  if (href) {
    return (
      <a
        href={href}
        onClick={onClick}
        className={cn(containerClass, 'no-underline')}
        target="_blank"
        rel="noopener noreferrer"
      >
        {content}
      </a>
    )
  }

  return (
    <div onClick={onClick} className={containerClass}>
      {content}
    </div>
  )
}
