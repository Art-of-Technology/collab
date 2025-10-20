"use client";

import React from 'react';
import { X, RefreshCw, ExternalLink, FileText, AlertCircle, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
    <div className="flex flex-row items-center gap-1">
        <button
            onClick={(e) => { e.stopPropagation(); onRefresh(); }}
            className="p-1 rounded text-muted-foreground bg-background/90 hover:bg-primary/10 hover:text-primary border border-border/30 hover:border-primary/30 transition-colors"
            title="Refresh preview"
        >
            <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
        </button>
        <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="p-1 rounded bg-background/90 text-muted-foreground hover:bg-destructive/10 hover:text-destructive border border-border/30 hover:border-destructive/30 transition-controls"
            title="Remove preview"
        >
            <X className="size-4" />
        </button>
    </div>
);

const PreviewIcon = ({ type, isError }: { type: 'note' | 'issue' | 'external' | 'error'; isError?: boolean }) => {
    const icons = {
        note: <FileText className="h-4 w-4 text-primary" />,
        issue: <AlertCircle className="h-4 w-4 text-primary" />,
        error: <AlertCircle className="h-4 w-4 text-destructive" />,
        external: <ExternalLink className="h-4 w-4 text-muted-foreground" />
    };

    const bgClass = isError ? 'bg-destructive/10' : 'bg-primary/10';

    return (
        <div className={cn("p-2 rounded flex-shrink-0", bgClass)}>
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
    LOW: 'bg-gray-500/10 text-gray-500',
    MEDIUM: 'bg-yellow-500/10 text-yellow-500',
    HIGH: 'bg-orange-500/10 text-orange-500',
    URGENT: 'bg-red-500/10 text-red-500',
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
                                {preview.description?.toLocaleLowerCase()}
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
                        <div className="flex items-center gap-1.5 mb-0.5">
                            <h4 className="my-0 text-xs font-medium text-foreground line-clamp-1">
                                {preview.title}
                            </h4>
                            {preview.metadata?.status && (
                                <Badge variant="outline" className={cn("text-xs py-0 px-1.5 font-normal", STATUS_COLORS[preview.metadata.status as keyof typeof STATUS_COLORS] || STATUS_COLORS.TODO)}>
                                    {preview.metadata.status.replace('_', ' ')}
                                </Badge>
                            )}
                            {preview.metadata?.priority && (
                                <Badge variant="outline" className={cn("text-xs py-0 px-1.5 font-normal", PRIORITY_COLORS[preview.metadata.priority as keyof typeof PRIORITY_COLORS] || PRIORITY_COLORS.MEDIUM)}>
                                    {preview.metadata.priority.toLocaleLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
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

            <div className="p-2.5">
                <div className="flex items-center gap-2">
                    {renderContent()}
                    <div className='flex flex-row gap-1 opacity-0 group-hover:opacity-100 transition-opacity'>
                        <Button variant="ghost"
                            type="button"
                            className="p-1 rounded aspect-square h-7 bg-transparent text-muted-foreground hover:bg-primary/10 border border-transparent hover:border-primary/30 hover:text-primary transition-colors"
                            onClick={(e) => { e.stopPropagation(); window.open(preview.url, '_blank'); }}
                        >
                            <ExternalLink className="size-4" />
                        </Button>
                        {isEditable && <PreviewControls onRefresh={onRefresh} onRemove={onRemove} isLoading={isLoading} />}
                    </div>
                </div>
            </div>
        </div>
    );
}

