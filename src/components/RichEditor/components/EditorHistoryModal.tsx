"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { X, ArrowLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import DOMPurify from 'isomorphic-dompurify';
import { useToast } from '@/hooks/use-toast';
import { useIssueActivities } from '@/components/issue/sections/activity/hooks/useIssueActivities';
import { CustomAvatar } from '@/components/ui/custom-avatar';
import { RichEditor } from '../RichEditor';
import type { RichEditorRef } from '../types';

interface EditorHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  collabDocumentId?: string;
  issueId?: string;
  editorRef?: React.RefObject<RichEditorRef | null>;
}

export function EditorHistoryModal({ 
  isOpen, 
  onClose, 
  collabDocumentId,
  issueId,
  editorRef
}: EditorHistoryModalProps) {
  const { toast } = useToast();
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [historyPreview, setHistoryPreview] = useState<{ id: string; html: string; meta: any } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Activities (DESCRIPTION_UPDATED) via hook
  const { activities, loading: activitiesLoading, error: activitiesError } = useIssueActivities({
    issueId: issueId || '',
    limit: 100,
    action: 'DESCRIPTION_UPDATED' as any,
  });

  const htmlFromSnapshot = useCallback((snapshot: any) => {
    try {
      if (typeof snapshot === 'string') {
        const trimmed = snapshot.trim();
        if (trimmed.startsWith('<')) return trimmed;
        try {
          const asJson = JSON.parse(trimmed);
          // If consumers still pass JSON doc, render fallback to simple text
          return `<div>${DOMPurify.sanitize(JSON.stringify(asJson))}</div>`;
        } catch {
          return `<p>${DOMPurify.sanitize(trimmed)}</p>`;
        }
      }
      if (snapshot && typeof snapshot === 'object') {
        // If object, try to use displayNewValue/newValue if present
        const html = snapshot.displayNewValue || snapshot.newValue || snapshot.description;
        if (typeof html === 'string') return html;
      }
      return '<p>(unable to render)</p>';
    } catch {
      return '<p>(unable to render)</p>';
    }
  }, []);

  const openHistoryPreview = useCallback(async (entry: any) => {
    setPreviewError(null);
    setPreviewLoading(true);
    try {
      const content = entry?.content ?? entry?.details?.displayNewValue ?? entry?.details?.newValue;
      const html = DOMPurify.sanitize(htmlFromSnapshot(content));
      setHistoryPreview({ id: String(entry.id), html, meta: entry });
    } catch (e: any) {
      setPreviewError(e?.message || 'Failed to load history entry');
    } finally {
      setPreviewLoading(false);
    }
  }, [htmlFromSnapshot]);

  // Auto-select last activity when opening or when list updates
  useEffect(() => {
    if (!isOpen) return;
    if (!selectedEntryId && activities && activities.length > 0) {
      setSelectedEntryId(activities[0].id);
    }
  }, [isOpen, activities, selectedEntryId]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setHistoryPreview(null);
      setSelectedEntryId(null);
      setPreviewError(null);
      setPreviewLoading(false);
    }
  }, [isOpen]);

  if (!collabDocumentId || !issueId) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>History</DialogTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-white/10"
              onClick={onClose}
              aria-label="Close history"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        {activitiesError && (
          <div className="text-sm text-red-400 mb-2">{activitiesError}</div>
        )}
        {/* List view vs Preview view */}
        {historyPreview ? (
          <div className="flex flex-col gap-3">
            {/* Preview header */}
            <div className="flex items-center justify-start gap-4">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" className="hover:bg-white/10" onClick={() => { setHistoryPreview(null); setPreviewError(null); }}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Back
                </Button>
              </div>
              <div className="flex gap-2.5 items-center">
                <div className="flex-shrink-0 mt-0.5">
                  <CustomAvatar user={historyPreview.meta?.user} size="xs" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col">
                    <span className="text-xs text-[#c9d1d9] leading-tight tracking-tight">
                      {historyPreview.meta?.actor} made changes
                    </span>
                    <span className="text-[10px] text-[#7d8590] leading-tight tracking-tight">
                      {formatDistanceToNow(new Date(historyPreview.meta?.ts || Date.now()), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {previewError && (
              <div className="text-sm text-red-400">{previewError}</div>
            )}

            <div className="border rounded-md overflow-hidden">
              <ScrollArea className="h-72">
                <div className="p-3">
                  {previewLoading ? (
                    <div className="p-3 text-sm text-muted-foreground">Loading preview...</div>
                  ) : (
                    <RichEditor
                      value={historyPreview.html}
                      onChange={undefined}
                      placeholder={""}
                      className="w-full max-w-[24rem]"
                      minHeight="160px"
                      maxHeight="none"
                      readOnly={true}
                      showToolbar={false}
                      toolbarMode="static"
                    />
                  )}
                </div>
              </ScrollArea>
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                className="hover:bg-white/10"
                onClick={() => {
                  try {
                    const html = historyPreview?.html || '';
                    const editor = editorRef?.current;
                    if (editor && typeof editor.setContent === 'function') {
                      editor.setContent(html);
                    } else {
                      editorRef?.current?.getEditor()?.commands.setContent(html);
                    }
                    const username = historyPreview?.meta?.actor || historyPreview?.meta?.user?.name || 'unknown';
                    const dateStr = new Date(historyPreview?.meta?.ts || Date.now()).toLocaleString();
                    onClose();
                    setHistoryPreview(null);
                    setPreviewError(null);
                    toast({
                      title: 'Reverted',
                      description: `Successfully returned into ${username}'s version ${dateStr}`,
                    });
                  } catch (e) {
                    toast({ title: 'Error', description: 'Failed to revert', variant: 'destructive' });
                  }
                }}
              >
                Revert to this version
              </Button>
            </div>
          </div>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <ScrollArea className="h-[378px]">
              <div className="divide-y divide-border/50">
                {activitiesLoading ? (
                  <div className="p-3 text-sm text-muted-foreground">Loading...</div>
                ) : activities.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">No history entries</div>
                ) : (
                  activities.map((a) => (
                    <button
                      key={a.id}
                      className={cn(
                        "w-full text-left p-3 hover:bg-[#0d0d0d]",
                        selectedEntryId === a.id ? "bg-muted/60" : ""
                      )}
                      onClick={() => {
                        setSelectedEntryId(a.id);
                        openHistoryPreview({
                          id: a.id,
                          content: a.details?.displayNewValue || a.details?.newValue || a.newValue,
                          user: a.user,
                          actor: a.user?.name,
                          ts: new Date(a.createdAt).getTime(),
                        });
                      }}
                    >
                      <div className="flex gap-2.5 items-center">
                        <div className="flex-shrink-0 mt-0.5">
                          <CustomAvatar user={a.user} size="xs" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-xs text-[#c9d1d9]">
                              {a.user.name} made changes
                            </span>
                            <span className="text-[10px] text-[#7d8590]">
                              {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
