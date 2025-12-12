import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import { Webhook, CheckCircle, XCircle, Clock, Activity, TrendingUp } from 'lucide-react';
import WebhookSummaryCards from './WebhookSummaryCards';
import WebhookList from './WebhookList';
import RecentDeliveriesTable from './RecentDeliveriesTable';
import { getWebhookStats, getWebhooksWithStats, getRecentDeliveries } from './data';

export default async function WebhooksPage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    redirect('/login');
  }

  const [stats, webhooks, recentDeliveries] = await Promise.all([
    getWebhookStats(session.user.id),
    getWebhooksWithStats(session.user.id),
    getRecentDeliveries(session.user.id, 20)
  ]);

  const summaryCards = [
    {
      title: 'Total Webhooks',
      value: stats.totalWebhooks,
      description: 'All webhooks',
      icon: Webhook,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: 'Active',
      value: stats.activeWebhooks,
      description: 'Currently active',
      icon: CheckCircle,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
    },
    {
      title: 'Total Deliveries',
      value: stats.totalDeliveries,
      description: 'Last 30 days',
      icon: Activity,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
    },
    {
      title: 'Success Rate',
      value: `${stats.successRate}%`,
      description: 'Delivery success',
      icon: TrendingUp,
      color: stats.successRate >= 95 ? 'text-green-400' : stats.successRate >= 80 ? 'text-amber-400' : 'text-red-400',
      bgColor: stats.successRate >= 95 ? 'bg-green-500/10' : stats.successRate >= 80 ? 'bg-amber-500/10' : 'bg-red-500/10',
    },
    {
      title: 'Failed',
      value: stats.failedDeliveries,
      description: 'Last 30 days',
      icon: XCircle,
      color: 'text-red-400',
      bgColor: 'bg-red-500/10',
    },
    {
      title: 'Pending Retries',
      value: stats.pendingRetries,
      description: 'Awaiting retry',
      icon: Clock,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
    },
  ];

  return (
    <div className="container mx-auto px-4 py-4 sm:py-8 max-w-6xl">
      <div className="mb-4 sm:mb-8">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Webhooks Overview</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-2">
          Manage and monitor your webhooks
        </p>
      </div>

      <WebhookSummaryCards cards={summaryCards} />

      <div className="grid gap-4 sm:gap-6 mb-6 sm:mb-8">
        <WebhookList webhooks={webhooks} />
      </div>

      <div className="grid gap-4 sm:gap-6 mb-6 sm:mb-8">
        <RecentDeliveriesTable deliveries={recentDeliveries} />
      </div>
    </div>
  );
}

