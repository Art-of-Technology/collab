'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function DevBreadcrumb() {
  const pathname = usePathname();

  if (pathname === '/dev' || pathname === '/dev/' || pathname === '/dev/apps') {
    return null;
  }

  const segments = pathname.split('/').filter(Boolean);
  const devSegments = segments.filter(s => s !== 'dev');
  const breadcrumbs = devSegments.map((segment, index) => {
    const href = '/dev/' + devSegments.slice(0, index + 1).join('/');
    const isLast = index === devSegments.length - 1;
    
    let label = segment;
    if (segment === 'apps') label = 'My Apps';
    else if (segment === 'docs') label = 'API Documentation';
    else if (segment === 'webhooks') label = 'Webhooks';
    else if (segment === 'settings') label = 'Settings';
    else if (segment === 'new') label = 'New App';
    else if (segment === 'manage') label = 'Manage';
    else label = segment.charAt(0).toUpperCase() + segment.slice(1);

    return { href, label, isLast };
  });

  return (
    <div className="flex items-center gap-3 text-xs sm:text-sm text-muted-foreground bg-transparent p-0 m-0 border-0 border-b-0" role="navigation" aria-label="Breadcrumb">
      <Link
        href="/dev/apps"
        className="hover:text-foreground transition-colors"
      >
        <Home className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </Link>
      {breadcrumbs.map((crumb, index) => (
        <div key={crumb.href} className="flex items-center gap-1.5">
          <ChevronRight className="h-3 w-3 flex-shrink-0" />
          {crumb.isLast ? (
            <span className={cn("text-foreground font-medium truncate")}>
              {crumb.label}
            </span>
          ) : (
            <Link
              href={crumb.href}
              className="hover:text-foreground transition-colors truncate"
            >
              {crumb.label}
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}

