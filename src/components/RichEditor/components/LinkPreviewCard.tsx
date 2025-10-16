"use client";

import React from 'react';
import { X, RefreshCw, ExternalLink, FileText, AlertCircle, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';

interface LinkPreviewData {
    type: 'internal' | 'external';
    subtype?: 'note' | 'issue';
    title: string;
    description: string;
    url: string;
    image: string | null;
    metadata?: {
        domain?: string;
        favicon?: string;
        workspace?: string;
        author?: string;
        assignee?: string;
        status?: string;
        priority?: string;
        isPublic?: boolean;
        isFavorite?: boolean;
        updatedAt?: string;
        notFound?: boolean;
    };
}

interface LinkPreviewCardProps {
    preview: LinkPreviewData;
    onRemove: () => void;
    onRefresh: () => void;
    isLoading?: boolean;
    isEditable?: boolean;
}

const PreviewControls = ({ onRefresh, onRemove, isLoading }: { onRefresh: () => void; onRemove: () => void; isLoading: boolean }) => (
    <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button
            onClick={(e) => { e.stopPropagation(); onRefresh(); }}
            className="p-1 rounded bg-background/90 hover:bg-background border border-border/30 transition-colors"
            title="Refresh preview"
        >
            <RefreshCw className={cn("h-2.5 w-2.5", isLoading && "animate-spin")} />
        </button>
        <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="p-1 rounded bg-background/90 hover:bg-destructive/10 border border-border/30 hover:border-destructive/30 transition-controls"
            title="Remove preview"
        >
            <X className="h-2.5 w-2.5 text-muted-foreground hover:text-destructive" />
        </button>
    </div>
);

const PreviewIcon = ({ type, isError }: { type: 'note' | 'issue' | 'external' | 'error'; isError?: boolean }) => {
    const icons = {
        note: <FileText className="h-3.5 w-3.5 text-primary" />,
        issue: <AlertCircle className="h-3.5 w-3.5 text-primary" />,
        error: <AlertCircle className="h-3.5 w-3.5 text-destructive" />,
        external: <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
    };

    const bgClass = isError ? 'bg-destructive/10' : 'bg-primary/10';

    return (
        <div className={cn("p-1.5 rounded flex-shrink-0", bgClass)}>
            {icons[type]}
        </div>
    );
};

const STATUS_COLORS = {
    TODO: 'bg-gray-500/10 text-gray-500',
    IN_PROGRESS: 'bg-blue-500/10 text-blue-500',
    DONE: 'bg-green-500/10 text-green-500',
    CANCELLED: 'bg-red-500/10 text-red-500',
};

const PRIORITY_COLORS = {
    LOW: 'text-gray-500',
    MEDIUM: 'text-yellow-500',
    HIGH: 'text-orange-500',
    URGENT: 'text-red-500',
};

export function LinkPreviewCard({
    preview,
    onRemove,
    onRefresh,
    isLoading = false,
    isEditable = true
}: LinkPreviewCardProps) {
    const handleClick = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('button')) return;
        window.open(preview.url, '_blank');
    };

    const isNotFound = preview.metadata?.notFound || preview.title === 'Not Found';
    const isNote = preview.type === 'internal' && preview.subtype === 'note';
    const isIssue = preview.type === 'internal' && preview.subtype === 'issue';
    const isExternal = preview.type === 'external';

    const renderContent = () => {
        if (isNotFound) {
            return (
                <>
                    <PreviewIcon type="error" isError />
                    <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-medium text-destructive line-clamp-1 mb-0.5">
                            {preview.title}
                        </h4>
                        {preview.description && (
                            <div className="text-[10px] text-muted-foreground/60 line-clamp-1">
                                {preview.description}
                            </div>
                        )}
                    </div>
                </>
            );
        }

        if (isNote) {
            return (
                <>
                    <PreviewIcon type="note" />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                            <h4 className="text-xs font-medium text-foreground line-clamp-1">
                                {preview.title}
                            </h4>
                            {preview.metadata?.isFavorite && (
                                <Star className="h-2.5 w-2.5 fill-yellow-500 text-yellow-500 flex-shrink-0" />
                            )}
                            {preview.metadata?.isPublic && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-green-500/10 text-green-500 flex-shrink-0">
                                    Public
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                            <span>{preview.metadata?.author}</span>
                            <span>•</span>
                            <span>{preview.metadata?.workspace}</span>
                            {preview.metadata?.updatedAt && (
                                <>
                                    <span>•</span>
                                    <span>{formatDistanceToNow(new Date(preview.metadata.updatedAt), { addSuffix: true })}</span>
                                </>
                            )}
                        </div>
                    </div>
                </>
            );
        }

        if (isIssue) {
            return (
                <>
                    <PreviewIcon type="issue" />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <h4 className="my-0 text-xs font-medium text-foreground line-clamp-1">
                                {preview.title}
                            </h4>
                            {preview.metadata?.status && (
                                <Badge variant="outline" className={cn("text-xs", STATUS_COLORS[preview.metadata.status as keyof typeof STATUS_COLORS] || STATUS_COLORS.TODO)}>
                                    {preview.metadata.status.replace('_', ' ')}
                                </Badge>
                            )}
                            {preview.metadata?.priority && (
                                <Badge variant="outline" className={cn("text-xs", PRIORITY_COLORS[preview.metadata.priority as keyof typeof PRIORITY_COLORS] || PRIORITY_COLORS.MEDIUM)}>
                                    {preview.metadata.priority}
                                </Badge>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                            <span>{preview.metadata?.assignee || 'Unassigned'}</span>
                            <span>•</span>
                            <span>{preview.metadata?.workspace}</span>
                            {preview.metadata?.updatedAt && (
                                <>
                                    <span>•</span>
                                    <span>{formatDistanceToNow(new Date(preview.metadata.updatedAt), { addSuffix: true })}</span>
                                </>
                            )}
                        </div>
                    </div>
                </>
            );
        }

        // External link
        return (
            <>
                {preview.metadata?.favicon ? (
                    <div className="p-2">
                        <img
                            src={preview.metadata.favicon}
                            alt=""
                            className="w-4 h-4 flex-shrink-0 m-0"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                    </div>
                ) : (
                    <div className="w-4 h-4 flex-shrink-0 rounded bg-muted flex items-center justify-center">
                        <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <h4 className="m-0 text-xs font-medium text-foreground line-clamp-1">
                        {preview.title}
                    </h4>
                    <div className="text-[10px] text-muted-foreground/60 line-clamp-1">
                        {preview.metadata?.domain || new URL(preview.url).hostname}
                    </div>
                </div>
            </>
        );
    };

    return (
        <div
            className={cn(
                "group relative my-2 rounded-md border border-white/5 bg-black/40 hover:bg-black/20 transition-all overflow-hidden cursor-pointer",
                isLoading && "opacity-50"
            )}
            onClick={handleClick}
        >
            {isEditable && <PreviewControls onRefresh={onRefresh} onRemove={onRemove} isLoading={isLoading} />}

            <div className="p-2.5">
                <div className="flex items-center gap-2">
                    {renderContent()}
                    <ExternalLink className="h-3 w-3 text-muted-foreground/30 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
            </div>
        </div>
    );
}

