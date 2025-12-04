import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Grid3X3, Book, Webhook, Settings } from 'lucide-react';
import Link from 'next/link';

export default async function DevDashboardPage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    redirect('/login');
  }

  const quickLinks = [
    {
      name: 'My Apps',
      href: '/dev/apps',
      icon: Grid3X3,
      description: 'View and manage your applications',
    },
    {
      name: 'API Documentation',
      href: '/dev/docs',
      icon: Book,
      description: 'Browse API reference and guides',
      external: true,
    },
    {
      name: 'Webhooks Overview',
      href: '/dev/webhooks',
      icon: Webhook,
      description: 'Manage and monitor webhooks',
    },
    {
      name: 'Settings',
      href: '/dev/settings',
      icon: Settings,
      description: 'Account and developer settings',
    },
  ];

  return (
    <div className="container mx-auto px-4 py-4 sm:py-8 max-w-6xl">
      <div className="mb-4 sm:mb-8">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-2">
          Welcome to the Developer Console
        </p>
      </div>

      <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-2">
        {quickLinks.map((link) => {
          const Icon = link.icon;
          const linkContent = (
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="p-2 bg-muted rounded-lg">
                    <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base sm:text-lg mb-1">{link.name}</h3>
                    <p className="text-sm text-muted-foreground">{link.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );

          if (link.external) {
            return (
              <Link key={link.name} href={link.href} target="_blank" rel="noopener noreferrer">
                {linkContent}
              </Link>
            );
          }

          return (
            <Link key={link.name} href={link.href}>
              {linkContent}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

