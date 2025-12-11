'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Clock, Activity } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { type DeliveryRecord } from './data';

interface RecentDeliveriesTableProps {
  deliveries: DeliveryRecord[];
}

export default function RecentDeliveriesTable({ deliveries }: RecentDeliveriesTableProps) {
  if (deliveries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Deliveries
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-12">
          <Activity className="h-8 w-8 mx-auto mb-2 opacity-50 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No recent deliveries</p>
        </CardContent>
      </Card>
    );
  }

  const getStatusBadge = (delivery: DeliveryRecord) => {
    if (delivery.deliveredAt) {
      return (
        <Badge variant="outline" className="border-green-500/50 text-green-400 bg-green-500/10">
          <CheckCircle className="h-3 w-3 mr-1" />
          Success
        </Badge>
      );
    } else if (delivery.failedAt) {
      return (
        <Badge variant="outline" className="border-red-500/50 text-red-400 bg-red-500/10">
          <XCircle className="h-3 w-3 mr-1" />
          Failed
        </Badge>
      );
    } else if (delivery.nextAttemptAt) {
      return (
        <Badge variant="outline" className="border-amber-500/50 text-amber-400 bg-amber-500/10">
          <Clock className="h-3 w-3 mr-1" />
          Retrying
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline" className="border-gray-500/50 text-gray-400 bg-gray-500/10">
          <Clock className="h-3 w-3 mr-1" />
          Pending
        </Badge>
      );
    }
  };

  const getHttpStatusColor = (status: number | null) => {
    if (!status) return 'text-muted-foreground';
    if (status >= 200 && status < 300) return 'text-green-400';
    if (status >= 400 && status < 500) return 'text-red-400';
    if (status >= 500) return 'text-red-500';
    return 'text-amber-400';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Recent Deliveries
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/40">
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Event</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">App</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">HTTP</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Attempts</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Time</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery) => (
                <tr key={delivery.id} className="border-b border-border/20 hover:bg-card/30 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{delivery.eventType}</span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {delivery.eventId.slice(0, 8)}...
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <Link
                      href={`/dev/apps/${delivery.webhook.app.slug}`}
                      className="text-sm hover:underline"
                    >
                      {delivery.webhook.app.name}
                    </Link>
                    <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {delivery.webhook.url}
                    </p>
                  </td>
                  <td className="py-3 px-4">
                    {getStatusBadge(delivery)}
                  </td>
                  <td className="py-3 px-4">
                    {delivery.httpStatus ? (
                      <span className={`text-sm font-medium ${getHttpStatusColor(delivery.httpStatus)}`}>
                        {delivery.httpStatus}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-sm">{delivery.attempts}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(delivery.createdAt), { addSuffix: true })}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

