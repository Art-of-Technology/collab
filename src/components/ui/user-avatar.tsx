import React from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { User } from 'lucide-react'
import { cn } from '@/lib/utils'

export type UserAvatarSize = 'xs' | 'sm' | 'md' | 'lg'

const sizeClasses: Record<UserAvatarSize, { avatar: string; fallbackText: string; emptyIcon: string; emptyContainer: string }> = {
  xs: { avatar: 'h-4 w-4', fallbackText: 'text-[8px]', emptyIcon: 'h-2 w-2', emptyContainer: 'h-4 w-4' },
  sm: { avatar: 'h-5 w-5', fallbackText: 'text-[10px]', emptyIcon: 'h-2.5 w-2.5', emptyContainer: 'h-5 w-5' },
  md: { avatar: 'h-6 w-6', fallbackText: 'text-xs', emptyIcon: 'h-3 w-3', emptyContainer: 'h-6 w-6' },
  lg: { avatar: 'h-8 w-8', fallbackText: 'text-sm', emptyIcon: 'h-3.5 w-3.5', emptyContainer: 'h-8 w-8' },
}

export interface UserAvatarProps {
  user?: {
    name?: string | null
    image?: string | null
  } | null
  size?: UserAvatarSize
  className?: string
  /** Show empty placeholder when user is null/undefined. If false, renders nothing. */
  showEmpty?: boolean
}

export function UserAvatar({ user, size = 'sm', className, showEmpty = true }: UserAvatarProps) {
  const s = sizeClasses[size]

  if (!user) {
    if (!showEmpty) return null
    return (
      <div className={cn(
        'rounded-full bg-collab-800 border border-collab-600 flex items-center justify-center',
        s.emptyContainer,
        className
      )}>
        <User className={cn('text-collab-500', s.emptyIcon)} />
      </div>
    )
  }

  return (
    <Avatar className={cn(s.avatar, className)}>
      <AvatarImage src={user.image || undefined} />
      <AvatarFallback className={cn('bg-collab-600 text-white border-none font-medium', s.fallbackText)}>
        {user.name?.charAt(0)?.toUpperCase() || '?'}
      </AvatarFallback>
    </Avatar>
  )
}
