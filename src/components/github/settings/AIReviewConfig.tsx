'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Bot,
  Loader2,
  Info,
  Zap,
  MousePointer,
  Shield,
  Bug,
  Sparkles,
  Code,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AIReviewConfigProps {
  repositoryId: string;
}

export function AIReviewConfig({ repositoryId }: AIReviewConfigProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiReviewEnabled, setAiReviewEnabled] = useState(false);
  const [aiReviewAutoTrigger, setAiReviewAutoTrigger] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, [repositoryId]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/github/repositories/${repositoryId}/ai-review-settings`);
      if (response.ok) {
        const data = await response.json();
        setAiReviewEnabled(data.aiReviewEnabled);
        setAiReviewAutoTrigger(data.aiReviewAutoTrigger);
      }
    } catch (error) {
      console.error('Error fetching AI review settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await fetch(`/api/github/repositories/${repositoryId}/ai-review-settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiReviewEnabled,
          aiReviewAutoTrigger,
        }),
      });

      if (response.ok) {
        toast.success('AI Review settings saved');
        setHasChanges(false);
      } else {
        toast.error('Failed to save settings');
      }
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = (enabled: boolean) => {
    setAiReviewEnabled(enabled);
    if (!enabled) {
      setAiReviewAutoTrigger(false);
    }
    setHasChanges(true);
  };

  const handleToggleAutoTrigger = (autoTrigger: boolean) => {
    setAiReviewAutoTrigger(autoTrigger);
    setHasChanges(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-collab-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="rounded-lg border border-collab-700 bg-collab-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-collab-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 text-violet-400" />
            <div>
              <h3 className="text-sm font-medium text-collab-50">AI Code Review</h3>
              <p className="text-xs text-collab-500">
                Automatically analyze pull requests with AI
              </p>
            </div>
          </div>
          <Badge
            className={cn(
              aiReviewEnabled
                ? 'bg-green-500/10 text-green-400 border-green-500/30'
                : 'bg-collab-700 text-collab-400 border-collab-600'
            )}
          >
            {aiReviewEnabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>

        {/* Enable/Disable Toggle */}
        <div className="p-4 border-b border-collab-700">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <label className="text-sm font-medium text-collab-50">
                Enable AI Reviews
              </label>
              <p className="text-xs text-collab-500">
                When enabled, AI will analyze your pull requests and provide code review feedback
              </p>
            </div>
            <Button
              variant="ghost"
              onClick={() => handleToggleEnabled(!aiReviewEnabled)}
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors p-0',
                aiReviewEnabled ? 'bg-violet-400' : 'bg-[#30363d]'
              )}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                  aiReviewEnabled ? 'translate-x-6' : 'translate-x-1'
                )}
              />
            </Button>
          </div>
        </div>

        {/* Trigger Mode */}
        {aiReviewEnabled && (
          <div className="p-4">
            <label className="text-sm font-medium text-collab-50 block mb-3">
              Trigger Mode
            </label>
            <div className="grid grid-cols-2 gap-3">
              {/* Manual Mode */}
              <Button
                variant="ghost"
                onClick={() => handleToggleAutoTrigger(false)}
                className={cn(
                  'p-4 rounded-lg border text-left transition-all h-auto',
                  !aiReviewAutoTrigger
                    ? 'border-[#a371f7] bg-violet-400/10'
                    : 'border-collab-600 bg-collab-900 hover:border-collab-600'
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <MousePointer className="h-4 w-4 text-violet-400" />
                  <span className="text-sm font-medium text-collab-50">Manual</span>
                  {!aiReviewAutoTrigger && (
                    <CheckCircle2 className="h-4 w-4 text-violet-400 ml-auto" />
                  )}
                </div>
                <p className="text-xs text-collab-400">
                  Trigger AI reviews manually using the "Request Review" button in PRs
                </p>
              </Button>

              {/* Automatic Mode */}
              <Button
                variant="ghost"
                onClick={() => handleToggleAutoTrigger(true)}
                className={cn(
                  'p-4 rounded-lg border text-left transition-all h-auto',
                  aiReviewAutoTrigger
                    ? 'border-[#a371f7] bg-violet-400/10'
                    : 'border-collab-600 bg-collab-900 hover:border-collab-600'
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="h-4 w-4 text-orange-400" />
                  <span className="text-sm font-medium text-collab-50">Automatic</span>
                  {aiReviewAutoTrigger && (
                    <CheckCircle2 className="h-4 w-4 text-violet-400 ml-auto" />
                  )}
                </div>
                <p className="text-xs text-collab-400">
                  Automatically review PRs when opened or updated (excludes drafts)
                </p>
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* What AI Reviews */}
      <div className="rounded-lg border border-collab-700 bg-collab-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-collab-700">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-blue-400" />
            <h3 className="text-sm font-medium text-collab-50">What AI Reviews Analyze</h3>
          </div>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-collab-900">
              <Shield className="h-4 w-4 text-red-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-collab-50">Security</p>
                <p className="text-xs text-collab-500">XSS, injection, auth issues</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-collab-900">
              <Bug className="h-4 w-4 text-orange-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-collab-50">Bugs</p>
                <p className="text-xs text-collab-500">Logic errors, edge cases</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-collab-900">
              <Zap className="h-4 w-4 text-yellow-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-collab-50">Performance</p>
                <p className="text-xs text-collab-500">N+1 queries, memory</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-collab-900">
              <Code className="h-4 w-4 text-blue-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-collab-50">Code Quality</p>
                <p className="text-xs text-collab-500">Readability, naming</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-collab-900">
              <Sparkles className="h-4 w-4 text-purple-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-collab-50">Best Practices</p>
                <p className="text-xs text-collab-500">Patterns, conventions</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-collab-900">
              <Bot className="h-4 w-4 text-green-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-collab-50">Suggestions</p>
                <p className="text-xs text-collab-500">Improvements, alternatives</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      {hasChanges && (
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-violet-400 hover:bg-violet-500 text-white"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
