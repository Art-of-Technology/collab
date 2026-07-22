import React from 'react'
import { cn } from '@/lib/utils'

export interface ContentSectionProps {
  title?: string
  description?: string
  children: React.ReactNode
  className?: string
  cta?: React.ReactNode
  compact?: boolean
}

export const ContentSection = ({
  title,
  description,
  children,
  className,
  cta,
  compact,
}: ContentSectionProps) => {
  return (
    <div
      className={cn(
        'relative flex flex-col',
        compact ? 'gap-6' : 'gap-8',
        className,
      )}
    >
      {(title || description || cta) && (
        <div className="flex w-full flex-col gap-y-2">
          {title && (
            <h2 className="text-lg font-medium text-white">{title}</h2>
          )}
          {description && (
            <p className="text-sm leading-snug text-collab-500">
              {description}
            </p>
          )}
          {cta && <div className="flex flex-row gap-x-2 mt-2">{cta}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
