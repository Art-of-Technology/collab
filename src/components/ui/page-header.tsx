import React from 'react'
import { cn } from '@/lib/utils'

export interface PageHeaderProps {
  title: string
  subtitle?: string | React.ReactNode
  actions?: React.ReactNode
  className?: string
  children?: React.ReactNode
}

export const PageHeader = ({
  title,
  subtitle,
  actions,
  className,
  children,
}: PageHeaderProps) => {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-white">{title}</h1>
          {subtitle && (
            <p className="text-sm text-collab-500 mt-0.5">
              {typeof subtitle === 'string' ? subtitle : subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2">{actions}</div>
        )}
      </div>
      {children}
    </div>
  )
}
