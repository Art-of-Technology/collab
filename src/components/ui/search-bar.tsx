"use client"

import React from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

export interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export const SearchBar = ({
  value,
  onChange,
  placeholder = 'Search...',
  className,
}: SearchBarProps) => {
  return (
    <div className={cn('relative flex-1 max-w-sm', className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-collab-500" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9 h-10 bg-collab-800 border-collab-700 text-collab-50 placeholder:text-collab-500 focus:border-collab-600 rounded-xl"
      />
    </div>
  )
}
