'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  BarChart3, 
  Activity, 
  Webhook, 
  CheckCircle, 
  XCircle, 
  Clock,
  TrendingUp,
  Calendar
} from 'lucide-react';

interface InstalledApp {
  id: string;
  status: string;
  createdAt: Date;
  app: {
    id: string;
    name: string;
    slug: string;
    iconUrl: string | null;
    publisherId: string;
    status: string;
  };
  webhooks: Array<{
    id: string;
    url: string;
    eventTypes: string[];
    isActive: boolean;
    _count: {
      deliveries: number;
    };
  }>;
}

interface AppAnalyticsDashboardProps {
  workspaceId: string;
  installedApps: InstalledApp[];
}

interface WebhookStats {
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  pendingDeliveries: number;
  successRate: number;
}

interface AppUsageStats {
  totalApps: number;
  activeApps: number;
  totalWebhooks: number;
  activeWebhooks: number;
  recentActivity: Array<{
    appName: string;
    action: string;
    timestamp: Date;
  }>;
}

export default function AppAnalyticsDashboard({ 
  workspaceId, 
  installedApps 
}: AppAnalyticsDashboardProps) {
  const [selectedPeriod, setSelectedPeriod] = useState('7d');
  const [webhookStats, setWebhookStats] = useState<WebhookStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Calculate basic stats from installed apps
  const appStats: AppUsageStats = {
    totalApps: installedApps.length,
    activeApps: installedApps.filter(app => app.status === 'ACTIVE').length,
    totalWebhooks: installedApps.reduce((sum, app) => sum + app.webhooks.length, 0),
    activeWebhooks: installedApps.reduce((sum, app) => 
      sum + app.webhooks.filter(w => w.isActive).length, 0
    ),
    recentActivity: [] // Would be populated from audit logs
  };

  // Fetch webhook delivery statistics
  useEffect(() => {
    const fetchWebhookStats = async () => {
      try {
        setLoading(true);
        // This would be a real API call to get webhook delivery stats
        // For now, we'll calculate from the available data
        const totalDeliveries = installedApps.reduce((sum, app) => 
          sum + app.webhooks.reduce((webhookSum, webhook) => 
            webhookSum + webhook._count.deliveries, 0
          ), 0
        );

        // Mock some additional stats (in a real implementation, these would come from the API)
        const mockStats: WebhookStats = {
          totalDeliveries,
          successfulDeliveries: Math.floor(totalDeliveries * 0.85),
          failedDeliveries: Math.floor(totalDeliveries * 0.10),
          pendingDeliveries: Math.floor(totalDeliveries * 0.05),
          successRate: 85
        };

        setWebhookStats(mockStats);
      } catch (error) {
        console.error('Error fetching webhook stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchWebhookStats();
  }, [installedApps, selectedPeriod]);

  const StatCard = ({ 
    title, 
    value, 
    description, 
    icon: Icon, 
    trend,
    color = 'default' 
  }: {
    title: string;
    value: string | number;
    description: string;
    icon: React.ElementType;
    trend?: string;
    color?: 'default' | 'success' | 'warning' | 'danger';
  }) => {
    const colorClasses = {
      default: 'text-muted-foreground',
      success: 'text-green-600',
      warning: 'text-yellow-600',
      danger: 'text-red-600'
    };

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Icon className={`h-4 w-4 ${colorClasses[color]}`} />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{value}</div>
          <p className="text-xs text-muted-foreground">{description}</p>
          {trend && (
            <div className="flex items-center pt-1">
              <TrendingUp className="h-3 w-3 text-green-600 mr-1" />
              <span className="text-xs text-green-600">{trend}</span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (installedApps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <BarChart3 className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">No analytics data</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Install apps to view usage analytics, webhook delivery metrics, and performance data.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Time Period Selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Analytics Overview</h3>
        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
          <SelectTrigger className="w-32">
            <Calendar className="w-4 h-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Apps"
          value={appStats.totalApps}
          description="Installed applications"
          icon={BarChart3}
          color="default"
        />
        <StatCard
          title="Active Apps"
          value={appStats.activeApps}
          description={`${Math.round((appStats.activeApps / appStats.totalApps) * 100)}% of total apps`}
          icon={Activity}
          color="success"
        />
        <StatCard
          title="Webhooks"
          value={`${appStats.activeWebhooks}/${appStats.totalWebhooks}`}
          description="Active webhook endpoints"
          icon={Webhook}
          color="default"
        />
        <StatCard
          title="Success Rate"
          value={`${webhookStats?.successRate || 0}%`}
          description="Webhook delivery success"
          icon={CheckCircle}
          color={webhookStats && webhookStats.successRate > 90 ? 'success' : 'warning'}
        />
      </div>

      {/* Webhook Delivery Stats */}
      {webhookStats && (
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            title="Successful Deliveries"
            value={webhookStats.successfulDeliveries}
            description="Successfully delivered webhooks"
            icon={CheckCircle}
            color="success"
          />
          <StatCard
            title="Failed Deliveries"
            value={webhookStats.failedDeliveries}
            description="Failed webhook deliveries"
            icon={XCircle}
            color="danger"
          />
          <StatCard
            title="Pending Deliveries"
            value={webhookStats.pendingDeliveries}
            description="Webhooks awaiting retry"
            icon={Clock}
            color="warning"
          />
        </div>
      )}

      {/* App-specific Analytics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">App Performance</CardTitle>
          <CardDescription>
            Individual app usage and webhook delivery statistics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {installedApps.map((installation) => {
              const { app, webhooks } = installation;
              const totalDeliveries = webhooks.reduce((sum, w) => sum + w._count.deliveries, 0);
              const activeWebhooks = webhooks.filter(w => w.isActive).length;

              return (
                <div key={installation.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center">
                      <Activity className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{app.name}</p>
                      <p className="text-xs text-muted-foreground">
                        by {app.publisherId}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-sm font-medium">{webhooks.length}</p>
                      <p className="text-xs text-muted-foreground">Webhooks</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium">{totalDeliveries}</p>
                      <p className="text-xs text-muted-foreground">Deliveries</p>
                    </div>
                    <Badge 
                      variant={installation.status === 'ACTIVE' ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {installation.status}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Activity</CardTitle>
          <CardDescription>
            Latest app installations and webhook events
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {installedApps.slice(0, 5).map((installation) => (
              <div key={installation.id} className="flex items-center gap-3 text-sm">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span className="text-muted-foreground">
                  {new Date(installation.createdAt).toLocaleDateString()}
                </span>
                <span>
                  Installed <strong>{installation.app.name}</strong>
                </span>
              </div>
            ))}
            {installedApps.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No recent activity
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
