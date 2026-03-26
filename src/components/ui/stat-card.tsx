import React from 'react'
import { cn } from '@/lib/utils'

export interface StatCardProps {
  label: string
  value: number | string
  variant?: 'default' | 'warning' | 'info' | 'success'
  icon?: React.ReactNode
  className?: string
}

const variantStyles = {
  default: 'text-white',
  warning: 'text-amber-400',
  info: 'text-blue-400',
  success: 'text-emerald-400',
}

export const StatCard = ({
  label,
  value,
  variant = 'default',
  icon,
  className,
}: StatCardProps) => {
  const isActive = variant !== 'default' && value !== 0 && value !== '0'

  return (
    <div
      className={cn(
        'p-5 rounded-2xl bg-collab-800 border border-collab-700',
        className,
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        {icon && <span className="text-collab-500">{icon}</span>}
        <span className="text-xs text-collab-500">{label}</span>
      </div>
      <div
        className={cn(
          'text-3xl font-semibold tabular-nums',
          isActive ? variantStyles[variant] : 'text-white',
        )}
      >
        {value}
      </div>
    </div>
  )
}
