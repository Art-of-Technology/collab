import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import { Package, FileText, CheckCircle, Download } from 'lucide-react';
import QuickActions from './dashboard/QuickActions';
import SummaryCards from './dashboard/SummaryCards';
import RecentActivityFeed from './dashboard/RecentActivityFeed';
import { getDashboardStats, getRecentActivities } from './dashboard/data';

export default async function DevDashboardPage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    redirect('/login');
  }

  const stats = await getDashboardStats(session.user.id);
  const activities = await getRecentActivities(session.user.id, 10);

  const summaryCards = [
    {
      title: 'Total Apps',
      value: stats.totalApps,
      description: 'All your applications',
      icon: Package,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      href: '/dev/apps',
    },
    {
      title: 'Draft',
      value: stats.draftApps,
      description: 'Apps in draft',
      icon: FileText,
      color: 'text-gray-400',
      bgColor: 'bg-gray-500/10',
      href: '/dev/apps?status=draft',
    },
    {
      title: 'In Review',
      value: stats.inReviewApps,
      description: 'Pending approval',
      icon: FileText,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      href: '/dev/apps?status=in_review',
    },
    {
      title: 'Published',
      value: stats.publishedApps,
      description: 'Live applications',
      icon: CheckCircle,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
      href: '/dev/apps?status=published',
    },
    {
      title: 'Total Installations',
      value: stats.totalInstallations,
      description: 'Across all apps',
      icon: Download,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      href: '/dev/apps',
    },
  ];



  return (
    <div className="container mx-auto px-4 py-4 sm:py-8 max-w-6xl">
      <div className="mb-4 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-2">
              Welcome to the Developer Console
            </p>
          </div>
          
          <QuickActions />
        </div>
      </div>

      <SummaryCards cards={summaryCards} />

      <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-2 mb-6 sm:mb-8">
        <RecentActivityFeed activities={activities} />
      </div>
    </div>
  );
}

