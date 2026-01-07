'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, CheckCircle, XCircle, Clock, Webhook as WebhookIcon } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { type WebhookWithStats } from './data';

interface WebhookListProps {
  webhooks: WebhookWithStats[];
}

export default function WebhookList({ webhooks }: WebhookListProps) {
  if (webhooks.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <WebhookIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-semibold mb-2">No webhooks yet</h3>
          <p className="text-muted-foreground mb-4">
            Webhooks will appear here once your apps have installations with webhook configurations.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>All Webhooks</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {webhooks.map((webhook) => {
            const successRate = webhook.stats.totalDeliveries > 0
              ? Math.round((webhook.stats.successfulDeliveries / webhook.stats.totalDeliveries) * 100)
              : 0;

            let statusIcon = Clock;
            let statusColor = 'text-gray-400';
            let statusBg = 'bg-gray-500/10';
            let statusText = 'No deliveries';

            if (webhook.stats.lastDeliveryStatus === 'success') {
              statusIcon = CheckCircle;
              statusColor = 'text-green-400';
              statusBg = 'bg-green-500/10';
              statusText = 'Last delivery successful';
            } else if (webhook.stats.lastDeliveryStatus === 'failed') {
              statusIcon = XCircle;
              statusColor = 'text-red-400';
              statusBg = 'bg-red-500/10';
              statusText = 'Last delivery failed';
            } else if (webhook.stats.lastDeliveryStatus === 'pending') {
              statusIcon = Clock;
              statusColor = 'text-amber-400';
              statusBg = 'bg-amber-500/10';
              statusText = 'Pending retry';
            }

            const StatusIcon = statusIcon;

            return (
              <div
                key={webhook.id}
                className="p-4 rounded-lg border border-border/40 bg-card/30 hover:bg-card/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`p-2 ${statusBg} rounded-lg`}>
                        <StatusIcon className={`h-4 w-4 ${statusColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Link
                            href={`/dev/apps/${webhook.app.slug}`}
                            className="font-medium hover:underline"
                          >
                            {webhook.app.name}
                          </Link>
                          <Badge variant={webhook.isActive ? 'default' : 'secondary'}>
                            {webhook.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground break-all">
                          {webhook.url}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 mt-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Workspace: </span>
                        <span className="font-medium">{webhook.installation.workspace.name}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Events: </span>
                        <span className="font-medium">{webhook.eventTypes.length}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Total Deliveries: </span>
                        <span className="font-medium">{webhook.stats.totalDeliveries}</span>
                      </div>
                      {webhook.stats.totalDeliveries > 0 && (
                        <div>
                          <span className="text-muted-foreground">Success Rate: </span>
                          <span className={`font-medium ${successRate >= 95 ? 'text-green-400' : successRate >= 80 ? 'text-amber-400' : 'text-red-400'}`}>
                            {successRate}%
                          </span>
                        </div>
                      )}
                      {webhook.stats.lastDeliveryAt && (
                        <div>
                          <span className="text-muted-foreground">Last Delivery: </span>
                          <span className="font-medium">
                            {formatDistanceToNow(new Date(webhook.stats.lastDeliveryAt), { addSuffix: true })}
                          </span>
                        </div>
                      )}
                    </div>

                    {webhook.eventTypes.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {webhook.eventTypes.slice(0, 5).map((eventType, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {eventType}
                          </Badge>
                        ))}
                        {webhook.eventTypes.length > 5 && (
                          <Badge variant="outline" className="text-xs">
                            +{webhook.eventTypes.length - 5} more
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <Link href={`/dev/apps/${webhook.app.slug}`}>
                      <Button variant="outline" size="sm">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View App
                      </Button>
                    </Link>
                    <span className="text-xs text-muted-foreground">{statusText}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

