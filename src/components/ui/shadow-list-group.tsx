import { PropsWithChildren } from 'react'
import { cn } from '@/lib/utils'

const ShadowListGroup = ({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) => (
  <div
    className={cn(
      'w-full overflow-hidden rounded-2xl bg-collab-800 ring-1 ring-collab-700',
      className,
    )}
  >
    {children}
  </div>
)

const ShadowListGroupItem = ({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) => (
  <div
    className={cn(
      'border-t border-collab-700 p-5 first:border-t-0',
      className,
    )}
  >
    {children}
  </div>
)

ShadowListGroup.displayName = 'ShadowListGroup'

export default Object.assign(ShadowListGroup, {
  Item: ShadowListGroupItem,
})

export { ShadowListGroup, ShadowListGroupItem }
