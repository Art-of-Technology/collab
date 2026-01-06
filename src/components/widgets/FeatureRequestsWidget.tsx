"use client";

import React from 'react';
import { Lightbulb, ThumbsUp, ThumbsDown, MessageSquare } from 'lucide-react';
import { Widget, WidgetFooterLink } from './Widget';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';

interface FeatureRequest {
  id: string;
  title: string;
  description: string;
  status: string;
  voteScore: number;
  upvotes: number;
  downvotes: number;
  createdAt: string;
  author: {
    id: string;
    name: string | null;
    image: string | null;
  };
  _count: {
    comments: number;
  };
}

interface FeatureRequestsWidgetProps {
  featureRequests: FeatureRequest[];
  isLoading?: boolean;
  workspaceId: string;
  projectSlug: string;
  onFeatureClick?: (featureId: string) => void;
}

const statusColors: Record<string, { bg: string; text: string }> = {
  pending: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
  under_review: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  planned: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  in_progress: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  completed: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  declined: { bg: 'bg-red-500/20', text: 'text-red-400' },
};

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  under_review: 'Under Review',
  planned: 'Planned',
  in_progress: 'In Progress',
  completed: 'Completed',
  declined: 'Declined',
};

function FeatureRow({
  feature,
  onFeatureClick,
}: {
  feature: FeatureRequest;
  onFeatureClick?: (featureId: string) => void;
}) {
  const statusStyle = statusColors[feature.status] || statusColors.pending;
  const timeAgo = formatDistanceToNow(new Date(feature.createdAt), { addSuffix: true });

  return (
    <div
      className="px-3 py-2.5 rounded-md hover:bg-[#161616] cursor-pointer transition-colors"
      onClick={() => onFeatureClick?.(feature.id)}
    >
      {/* Title row */}
      <div className="flex items-start gap-2 mb-1.5">
        <p className="text-sm text-[#e6edf3] line-clamp-2 flex-1">
          {feature.title}
        </p>
        <Badge
          className={cn(
            "text-[10px] px-1.5 py-0 h-4 flex-shrink-0",
            statusStyle.bg,
            statusStyle.text
          )}
        >
          {statusLabels[feature.status] || feature.status}
        </Badge>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-3 text-[10px] text-[#666]">
        {/* Vote score */}
        <div className="flex items-center gap-1">
          {feature.voteScore >= 0 ? (
            <ThumbsUp className="h-3 w-3 text-emerald-400" />
          ) : (
            <ThumbsDown className="h-3 w-3 text-red-400" />
          )}
          <span className={feature.voteScore >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            {feature.voteScore > 0 ? '+' : ''}{feature.voteScore}
          </span>
        </div>

        {/* Comments */}
        <div className="flex items-center gap-1">
          <MessageSquare className="h-3 w-3" />
          <span>{feature._count.comments}</span>
        </div>

        {/* Author */}
        <div className="flex items-center gap-1">
          <Avatar className="h-3.5 w-3.5">
            <AvatarImage src={feature.author.image || undefined} />
            <AvatarFallback className="text-[6px] bg-[#222]">
              {feature.author.name?.charAt(0)?.toUpperCase() || '?'}
            </AvatarFallback>
          </Avatar>
          <span>{feature.author.name || 'Unknown'}</span>
        </div>

        {/* Time */}
        <span className="ml-auto">{timeAgo}</span>
      </div>
    </div>
  );
}

export function FeatureRequestsWidget({
  featureRequests,
  isLoading = false,
  workspaceId,
  projectSlug,
  onFeatureClick,
}: FeatureRequestsWidgetProps) {
  const isEmpty = featureRequests.length === 0;
  const pendingCount = featureRequests.filter(f =>
    f.status === 'pending' || f.status === 'under_review'
  ).length;

  return (
    <Widget
      title="Feature Requests"
      icon={<Lightbulb className="h-4 w-4" />}
      isLoading={isLoading}
      isEmpty={isEmpty}
      emptyMessage="No feature requests yet"
      emptyIcon={<Lightbulb className="h-8 w-8" />}
      headerRight={
        pendingCount > 0 && (
          <Badge
            variant="outline"
            className="text-xs px-1.5 py-0 h-5 border-amber-500/50 text-amber-400"
          >
            {pendingCount} pending
          </Badge>
        )
      }
    >
      <div className="space-y-1">
        {featureRequests.slice(0, 5).map(feature => (
          <FeatureRow
            key={feature.id}
            feature={feature}
            onFeatureClick={onFeatureClick}
          />
        ))}

        {featureRequests.length > 0 && (
          <WidgetFooterLink
            href={`/${workspaceId}/projects/${projectSlug}/features`}
            label="View all feature requests"
          />
        )}
      </div>
    </Widget>
  );
}

export default FeatureRequestsWidget;
