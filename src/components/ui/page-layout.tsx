"use client"

import React from 'react'
import { cn } from '@/lib/utils'

export interface PageLayoutProps {
  children: React.ReactNode
  className?: string
  wide?: boolean
}

export const PageLayout = ({
  children,
  className,
  wide = false,
}: PageLayoutProps) => {
  return (
    <div className="h-full w-full overflow-y-auto">
      <div
        className={cn(
          'flex flex-col gap-6 p-8 mx-auto',
          wide ? 'max-w-[1600px]' : 'max-w-[1400px]',
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}
