"use client"

import React from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export interface FilterToggleOption {
  id: string
  label: string
  count?: number
  icon?: React.ReactNode
}

export interface FilterToggleProps {
  options: FilterToggleOption[]
  value: string
  onChange: (id: string) => void
  className?: string
}

export const FilterToggle = ({
  options,
  value,
  onChange,
  className,
}: FilterToggleProps) => {
  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-xl border border-collab-700 p-1 bg-collab-800',
        className,
      )}
    >
      {options.map((option) => {
        const isActive = value === option.id
        return (
          <Button
            key={option.id}
            variant="ghost"
            size="sm"
            onClick={() => onChange(option.id)}
            className={cn(
              'h-8 px-3 gap-1.5 rounded-lg text-sm',
              isActive
                ? 'bg-collab-600 text-white'
                : 'text-collab-500 hover:text-collab-400 hover:bg-transparent',
            )}
          >
            {option.icon}
            {option.label}
            {option.count !== undefined && (
              <span
                className={cn(
                  'tabular-nums',
                  isActive ? 'text-collab-400' : 'text-collab-500/60',
                )}
              >
                {option.count}
              </span>
            )}
          </Button>
        )
      })}
    </div>
  )
}
