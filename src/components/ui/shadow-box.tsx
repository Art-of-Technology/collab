import { PropsWithChildren } from 'react'
import { cn } from '@/lib/utils'

const ShadowBox = ({
  ref,
  className,
  children,
}: PropsWithChildren<{ className?: string }> & {
  ref?: React.RefObject<HTMLDivElement>
}) => (
  <div
    ref={ref}
    className={cn(
      'w-full rounded-xl border border-collab-700 bg-collab-800 p-8',
      className,
    )}
  >
    {children}
  </div>
)

ShadowBox.displayName = 'ShadowBox'

export default ShadowBox
export { ShadowBox }
