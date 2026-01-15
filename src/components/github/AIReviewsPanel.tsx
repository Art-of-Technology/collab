'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Shield,
  Bug,
  Zap,
  Code,
  Sparkles,
  Clock,
  User,
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  GitPullRequest,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface AIReviewFindings {
  security: Array<{ severity: string; message: string; file?: string; line?: number }>;
  bugs: Array<{ severity: string; message: string; file?: string; line?: number }>;
  performance: Array<{ severity: string; message: string; file?: string; line?: number }>;
  codeQuality: Array<{ severity: string; message: string; file?: string; line?: number }>;
  suggestions: Array<{ message: string; file?: string }>;
}

interface AIReview {
  id: string;
  summary: string;
  findings: AIReviewFindings;
  fullReview: string;
  filesAnalyzed: number;
  linesAnalyzed: number;
  issuesFound: number;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  status: 'PENDING' | 'ANALYZING' | 'COMPLETED' | 'FAILED';
  triggerType: 'AUTOMATIC' | 'MANUAL';
  postedToGitHub: boolean;
  githubCommentId?: string;
  errorMessage?: string;
  createdAt: string;
  triggeredBy?: {
    id: string;
    name: string;
    image?: string;
  };
  pullRequest?: {
    id: string;
    githubPrId: number;
    title: string;
    state: string;
  };
}

interface AIReviewsPanelProps {
  reviews: AIReview[];
  repositoryId?: string;
  repositoryFullName?: string;
  pullRequestId?: string;
  githubPrId?: number;
  onReviewRequested?: () => void;
  showRequestButton?: boolean;
  isAIReviewEnabled?: boolean;
}

export function AIReviewsPanel({
  reviews,
  repositoryId,
  repositoryFullName,
  pullRequestId,
  githubPrId,
  onReviewRequested,
  showRequestButton = false,
  isAIReviewEnabled = true,
}: AIReviewsPanelProps) {
  const [expandedReviews, setExpandedReviews] = useState<Set<string>>(new Set());
  const [requestingReview, setRequestingReview] = useState(false);

  const toggleExpanded = (reviewId: string) => {
    setExpandedReviews((prev) => {
      const next = new Set(prev);
      if (next.has(reviewId)) {
        next.delete(reviewId);
      } else {
        next.add(reviewId);
      }
      return next;
    });
  };

  const handleRequestReview = async () => {
    if (!repositoryId || !pullRequestId) return;

    try {
      setRequestingReview(true);
      const response = await fetch(
        `/api/github/repositories/${repositoryId}/pull-requests/${pullRequestId}/ai-review`,
        { method: 'POST' }
      );

      const data = await response.json();

      if (response.ok) {
        toast.success(data.message || 'AI review completed');
        onReviewRequested?.();
      } else {
        toast.error(data.error || 'Failed to request AI review');
      }
    } catch (error) {
      toast.error('Failed to request AI review');
    } finally {
      setRequestingReview(false);
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return <AlertCircle className="h-4 w-4 text-red-400" />;
      case 'WARNING':
        return <AlertTriangle className="h-4 w-4 text-yellow-400" />;
      default:
        return <CheckCircle className="h-4 w-4 text-green-400" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return (
          <Badge className="bg-red-500/10 text-red-400 border-red-500/30">
            Critical Issues
          </Badge>
        );
      case 'WARNING':
        return (
          <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
            Minor Issues
          </Badge>
        );
      default:
        return (
          <Badge className="bg-green-500/10 text-green-400 border-green-500/30">
            Looks Good
          </Badge>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ANALYZING':
        return (
          <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/30">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Analyzing
          </Badge>
        );
      case 'FAILED':
        return (
          <Badge className="bg-red-500/10 text-red-400 border-red-500/30">
            Failed
          </Badge>
        );
      case 'PENDING':
        return (
          <Badge className="bg-gray-500/10 text-gray-400 border-gray-500/30">
            Pending
          </Badge>
        );
      default:
        return null;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'security':
        return <Shield className="h-4 w-4 text-red-400" />;
      case 'bugs':
        return <Bug className="h-4 w-4 text-orange-400" />;
      case 'performance':
        return <Zap className="h-4 w-4 text-yellow-400" />;
      case 'codeQuality':
        return <Code className="h-4 w-4 text-blue-400" />;
      case 'suggestions':
        return <Sparkles className="h-4 w-4 text-purple-400" />;
      default:
        return <Bot className="h-4 w-4 text-gray-400" />;
    }
  };

  // Check if there's an in-progress review
  const hasInProgressReview = reviews.some((r) => r.status === 'PENDING' || r.status === 'ANALYZING');

  return (
    <div className="space-y-4">
      {/* Header with Request Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-[#a371f7]" />
          <h4 className="font-medium text-[#e6edf3]">AI Reviews ({reviews.length})</h4>
        </div>
        {showRequestButton && isAIReviewEnabled && !hasInProgressReview && (
          <Button
            onClick={handleRequestReview}
            disabled={requestingReview}
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs border-[#a371f7] text-[#a371f7] hover:bg-[#a371f7]/10"
          >
            {requestingReview ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Bot className="h-3 w-3 mr-1" />
                Request AI Review
              </>
            )}
          </Button>
        )}
      </div>

      {/* Empty State */}
      {reviews.length === 0 && (
        <div className="text-center py-8 text-[#8b949e]">
          <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-sm">No AI reviews yet</p>
          {showRequestButton && isAIReviewEnabled && (
            <p className="text-xs mt-1">
              Click "Request AI Review" to analyze the code changes
            </p>
          )}
          {!isAIReviewEnabled && (
            <p className="text-xs mt-1 text-[#6e7681]">
              Enable AI Reviews in GitHub settings to use this feature
            </p>
          )}
        </div>
      )}

      {/* Reviews List */}
      <div className="space-y-3">
        {reviews.map((review) => (
          <div
            key={review.id}
            className="rounded-lg border border-[#1f1f1f] bg-[#0d0d0e] overflow-hidden"
          >
            {/* Review Header */}
            <Button
              variant="ghost"
              onClick={() => toggleExpanded(review.id)}
              className="w-full px-4 py-3 flex items-start justify-between hover:bg-[#161617] transition-colors h-auto"
            >
              <div className="flex items-start gap-3">
                {getSeverityIcon(review.severity)}
                <div className="text-left">
                  <div className="flex items-center gap-2 flex-wrap">
                    {review.status === 'COMPLETED' && getSeverityBadge(review.severity)}
                    {getStatusBadge(review.status)}
                    {review.pullRequest && (
                      <Badge variant="outline" className="text-xs">
                        <GitPullRequest className="h-3 w-3 mr-1" />
                        #{review.pullRequest.githubPrId}
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className="text-xs text-[#8b949e] border-[#30363d]"
                    >
                      {review.triggerType === 'AUTOMATIC' ? 'Auto' : 'Manual'}
                    </Badge>
                  </div>
                  <p className="text-sm text-[#e6edf3] mt-1 line-clamp-2">
                    {review.status === 'COMPLETED' ? review.summary : review.errorMessage || 'Processing...'}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-[#6e7681]">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}
                    </span>
                    {review.triggeredBy && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {review.triggeredBy.name}
                      </span>
                    )}
                    {review.status === 'COMPLETED' && (
                      <>
                        <span>{review.filesAnalyzed} files</span>
                        <span>{review.issuesFound} issues</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {review.postedToGitHub && repositoryFullName && (
                  <a
                    href={`https://github.com/${repositoryFullName}/pull/${review.pullRequest?.githubPrId || githubPrId}#issuecomment-${review.githubCommentId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[#58a6ff] hover:underline text-xs flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    GitHub
                  </a>
                )}
                {expandedReviews.has(review.id) ? (
                  <ChevronDown className="h-4 w-4 text-[#8b949e]" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-[#8b949e]" />
                )}
              </div>
            </Button>

            {/* Expanded Content */}
            {expandedReviews.has(review.id) && review.status === 'COMPLETED' && (
              <div className="px-4 pb-4 pt-2 border-t border-[#1f1f1f]">
                {/* Findings by Category */}
                {Object.entries(review.findings as AIReviewFindings).map(([category, items]) => {
                  if (!items || items.length === 0) return null;

                  const categoryLabels: Record<string, string> = {
                    security: 'Security',
                    bugs: 'Potential Bugs',
                    performance: 'Performance',
                    codeQuality: 'Code Quality',
                    suggestions: 'Suggestions',
                  };

                  return (
                    <div key={category} className="mt-3">
                      <div className="flex items-center gap-2 mb-2">
                        {getCategoryIcon(category)}
                        <span className="text-sm font-medium text-[#e6edf3]">
                          {categoryLabels[category]} ({items.length})
                        </span>
                      </div>
                      <div className="space-y-2 pl-6">
                        {items.map((item: { message: string; file?: string; line?: number; severity?: string }, index: number) => (
                          <div
                            key={index}
                            className="text-sm text-[#8b949e] p-2 rounded bg-[#161617]"
                          >
                            {'severity' in item && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-xs mr-2',
                                  item.severity === 'CRITICAL' && 'border-red-500/30 text-red-400',
                                  item.severity === 'HIGH' && 'border-orange-500/30 text-orange-400',
                                  item.severity === 'MEDIUM' && 'border-yellow-500/30 text-yellow-400',
                                  item.severity === 'LOW' && 'border-gray-500/30 text-gray-400'
                                )}
                              >
                                {item.severity}
                              </Badge>
                            )}
                            {item.file && (
                              <code className="text-xs text-[#58a6ff] mr-2">
                                {item.file}
                                {item.line && `:${item.line}`}
                              </code>
                            )}
                            <span>{item.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* No Issues Found */}
                {review.issuesFound === 0 && (
                  <div className="flex items-center gap-2 p-3 rounded bg-green-500/10 text-green-400">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm">No significant issues found. This PR looks good!</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
