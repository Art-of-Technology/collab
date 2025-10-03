import { AppStatus } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface AppStatusBadgeProps {
  status: AppStatus;
  className?: string;
}

function getStatusColor(status: AppStatus) {
  switch (status) {
    case 'PUBLISHED': return 'bg-green-950/40 text-green-700';
    case 'DRAFT': return 'bg-yellow-950/40 text-yellow-700';
    case 'SUSPENDED': return 'bg-red-950/40 text-red-700';
    case 'REJECTED': return 'bg-red-950/40 text-red-700';
    case 'IN_REVIEW': return 'bg-blue-950/40 text-blue-700';
    default: return 'bg-gray-950/40 text-gray-700';
  }
}

export function AppStatusBadge({ status, className }: AppStatusBadgeProps) {
  const statusText = status.replace('_', ' ');
  const colorClasses = getStatusColor(status);
  
  return (
    <Badge 
      variant="outline" 
      className={cn(colorClasses, className)}
    >
      {statusText}
    </Badge>
  );
}
