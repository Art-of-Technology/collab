import React from 'react'
import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
  variant?: 'default' | 'dashed'
}

export const EmptyState = ({
  icon,
  title,
  description,
  action,
  className,
  variant = 'dashed',
}: EmptyStateProps) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 rounded-2xl',
        variant === 'dashed'
          ? 'border border-dashed border-collab-700 bg-collab-800'
          : 'bg-collab-800',
        className,
      )}
    >
      {icon && (
        <div className="p-4 rounded-2xl bg-collab-900 mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-medium text-collab-400 mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-collab-500 mb-4 text-center max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
