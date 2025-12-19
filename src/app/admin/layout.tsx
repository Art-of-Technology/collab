'use client';

import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Shield, Settings, Puzzle, Users, BarChart3, ArrowLeft, ChevronRight, Code2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';

const adminNavItems = [
  {
    name: 'Overview',
    href: '/admin',
    icon: BarChart3,
    exact: true,
  },
  {
    name: 'System Apps',
    href: '/admin/system-apps',
    icon: Puzzle,
  },
  {
    name: 'Users',
    href: '/admin/users',
    icon: Users,
  },
  {
    name: 'Settings',
    href: '/admin/settings',
    icon: Settings,
  },
];

const relatedLinks = [
  {
    name: 'App Review Queue',
    href: '/dev/manage',
    icon: Puzzle,
  },
  {
    name: 'Developer Console',
    href: '/dev',
    icon: Code2,
  },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated' && session?.user?.role !== 'SYSTEM_ADMIN') {
      router.push('/');
    }
  }, [status, session, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#090909] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#22c55e]" />
      </div>
    );
  }

  if (session?.user?.role !== 'SYSTEM_ADMIN') {
    return null;
  }

  const isActive = (href: string, exact?: boolean) => {
    if (exact) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-[#090909] flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-[#1f1f1f] flex flex-col h-screen sticky top-0 bg-[#090909]">
        {/* Header - Collab Logo with Admin Dashboard subtitle */}
        <div className="p-3 border-b border-[#1f1f1f]">
          <Link href="/admin" className="flex flex-col items-start gap-1">
            <Image src="/logo-text.svg" width={100} height={100} alt="Collab" className="h-6 w-auto" />
            <span className="text-xs text-gray-500 font-medium">Admin Dashboard</span>
          </Link>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 px-2 py-3">
          <nav className="space-y-0.5">
            {adminNavItems.map((item) => {
              const active = isActive(item.href, item.exact);
              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant="ghost"
                    className={cn(
                      'w-full justify-start h-8 px-2 text-sm transition-colors',
                      active
                        ? 'bg-[#1f1f1f] text-white'
                        : 'text-gray-400 hover:text-white hover:bg-[#1f1f1f]'
                    )}
                  >
                    <item.icon className="mr-2 h-4 w-4" />
                    {item.name}
                  </Button>
                </Link>
              );
            })}
          </nav>

          {/* Divider */}
          <div className="my-4 border-t border-[#1f1f1f]" />

          {/* Related Links */}
          <div className="space-y-0.5">
            <p className="px-2 text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              Related
            </p>
            {relatedLinks.map((item) => (
              <Link key={item.href} href={item.href}>
                <Button
                  variant="ghost"
                  className="w-full justify-start h-8 px-2 text-sm text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.name}
                </Button>
              </Link>
            ))}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="p-2 border-t border-[#1f1f1f]">
          <Link href="/">
            <Button
              variant="ghost"
              className="w-full justify-start h-8 px-2 text-sm text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Collab
            </Button>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="max-w-6xl mx-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
