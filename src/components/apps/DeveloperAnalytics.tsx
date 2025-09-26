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
  Calendar,
  Users,
  Download
} from 'lucide-react';

interface WebhookData {
  id: string;
  url: string;
  eventTypes: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    deliveries: number;
  };
}

interface Installation {
  id: string;
  status: string;
  createdAt: Date;
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
  webhooks: WebhookData[];
}

interface DeveloperAnalyticsProps {
  appId: string;
  appSlug: string;
  installations: Installation[];
}

interface AnalyticsStats {
  totalInstallations: number;
  activeInstallations: number;
  totalWebhooks: number;
  activeWebhooks: number;
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  successRate: number;
  installationsByMonth: Array<{
    month: string;
    count: number;
  }>;
  topWorkspaces: Array<{
    name: string;
    webhooks: number;
    deliveries: number;
  }>;
}

export default function DeveloperAnalytics({ 
  appId, 
  appSlug, 
  installations 
}: DeveloperAnalyticsProps) {
  const [selectedPeriod, setSelectedPeriod] = useState('30d');
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const calculateStats = () => {
      const activeInstalls = installations.filter(inst => inst.status === 'ACTIVE');
      const totalWebhooks = installations.reduce((sum, inst) => sum + inst.webhooks.length, 0);
      const activeWebhooks = installations.reduce((sum, inst) => 
        sum + inst.webhooks.filter(w => w.isActive).length, 0
      );
      const totalDeliveries = installations.reduce((sum, inst) => 
        sum + inst.webhooks.reduce((webhookSum, webhook) => 
          webhookSum + webhook._count.deliveries, 0
        ), 0
      );

      // Mock additional stats (in a real implementation, these would come from API)
      const successfulDeliveries = Math.floor(totalDeliveries * 0.85);
      const failedDeliveries = totalDeliveries - successfulDeliveries;
      const successRate = totalDeliveries > 0 ? Math.round((successfulDeliveries / totalDeliveries) * 100) : 0;

      // Calculate installations by month (last 6 months)
      const now = new Date();
      const installationsByMonth = [];
      for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        
        const count = installations.filter(inst => {
          const createdAt = new Date(inst.createdAt);
          return createdAt >= monthStart && createdAt <= monthEnd;
        }).length;

        installationsByMonth.push({
          month: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          count
        });
      }

      // Top workspaces by activity
      const topWorkspaces = activeInstalls
        .map(inst => ({
          name: inst.workspace.name,
          webhooks: inst.webhooks.length,
          deliveries: inst.webhooks.reduce((sum, w) => sum + w._count.deliveries, 0)
        }))
        .sort((a, b) => b.deliveries - a.deliveries)
        .slice(0, 5);

      const calculatedStats: AnalyticsStats = {
        totalInstallations: installations.length,
        activeInstallations: activeInstalls.length,
        totalWebhooks,
        activeWebhooks,
        totalDeliveries,
        successfulDeliveries,
        failedDeliveries,
        successRate,
        installationsByMonth,
        topWorkspaces
      };

      setStats(calculatedStats);
      setLoading(false);
    };

    calculateStats();
  }, [installations, selectedPeriod]);

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

  if (loading || !stats) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="animate-pulse">
                <div className="h-4 bg-muted rounded w-3/4"></div>
              </CardHeader>
              <CardContent className="animate-pulse">
                <div className="h-8 bg-muted rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-muted rounded w-full"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (installations.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
            <BarChart3 className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No analytics data</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Your app needs to be installed in workspaces to view analytics and performance metrics.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Time Period Selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Developer Analytics</h3>
        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
          <SelectTrigger className="w-32">
            <Calendar className="w-4 h-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="1y">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Installations"
          value={stats.totalInstallations}
          description="Workspaces using your app"
          icon={Download}
          color="default"
        />
        <StatCard
          title="Active Installations"
          value={stats.activeInstallations}
          description={`${Math.round((stats.activeInstallations / stats.totalInstallations) * 100)}% active`}
          icon={Activity}
          color="success"
        />
        <StatCard
          title="Webhooks"
          value={`${stats.activeWebhooks}/${stats.totalWebhooks}`}
          description="Active webhook endpoints"
          icon={Webhook}
          color="default"
        />
        <StatCard
          title="Success Rate"
          value={`${stats.successRate}%`}
          description="Webhook delivery success"
          icon={CheckCircle}
          color={stats.successRate > 90 ? 'success' : stats.successRate > 70 ? 'warning' : 'danger'}
        />
      </div>

      {/* Webhook Delivery Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Total Deliveries"
          value={stats.totalDeliveries}
          description="All webhook deliveries"
          icon={Activity}
          color="default"
        />
        <StatCard
          title="Successful"
          value={stats.successfulDeliveries}
          description="Successfully delivered"
          icon={CheckCircle}
          color="success"
        />
        <StatCard
          title="Failed"
          value={stats.failedDeliveries}
          description="Failed deliveries"
          icon={XCircle}
          color="danger"
        />
      </div>

      {/* Installation Growth */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Installation Growth</CardTitle>
          <CardDescription>
            New installations over the last 6 months
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {stats.installationsByMonth.map((month) => (
              <div key={month.month} className="flex items-center justify-between">
                <div className="text-sm font-medium">{month.month}</div>
                <div className="flex items-center gap-2">
                  <div className="w-32 bg-muted rounded-full h-2">
                    <div 
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ 
                        width: `${Math.max(10, (month.count / Math.max(...stats.installationsByMonth.map(m => m.count))) * 100)}%` 
                      }}
                    />
                  </div>
                  <div className="text-sm text-muted-foreground w-8 text-right">
                    {month.count}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top Workspaces */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Workspaces</CardTitle>
          <CardDescription>
            Workspaces with the most webhook activity
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats.topWorkspaces.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No active workspaces yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {stats.topWorkspaces.map((workspace, index) => (
                <div key={workspace.name} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center">
                      <span className="text-sm font-medium">{index + 1}</span>
                    </div>
                    <div>
                      <div className="font-medium">{workspace.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {workspace.webhooks} webhooks
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-sm font-medium">{workspace.deliveries}</div>
                    <div className="text-xs text-muted-foreground">deliveries</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Installation Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Installation Details</CardTitle>
          <CardDescription>
            Detailed view of all workspace installations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {installations.map((installation) => {
              const totalDeliveries = installation.webhooks.reduce((sum, w) => sum + w._count.deliveries, 0);
              const activeWebhooks = installation.webhooks.filter(w => w.isActive).length;

              return (
                <div key={installation.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center">
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-medium">{installation.workspace.name}</div>
                      <div className="text-sm text-muted-foreground">
                        Installed {new Date(installation.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-sm font-medium">{installation.webhooks.length}</div>
                      <div className="text-xs text-muted-foreground">webhooks</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-medium">{totalDeliveries}</div>
                      <div className="text-xs text-muted-foreground">deliveries</div>
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
    </div>
  );
}
