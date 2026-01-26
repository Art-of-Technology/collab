'use client';

import * as React from 'react';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Sparkles,
  ListTodo,
  Plus,
  Search,
  FolderKanban,
  Send,
  Circle,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  Minus,
  Flag,
  FileText,
  Bug,
  Zap,
  Milestone,
  Bookmark,
  ArrowRight,
  Brain,
  TrendingUp,
  Clock,
  Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface IssueData {
  id: string;
  key?: string;
  title: string;
  status?: string;
  priority?: string;
  type?: string;
  project?: string;
  dueDate?: string | null;
}

interface DashboardClientProps {
  user: {
    id: string;
    name: string;
    email: string;
  };
  workspace: {
    id: string;
    name: string;
    slug: string;
  } | null;
  workspaceId: string;
  priorityIssues: IssueData[];
  projects: Array<{
    id: string;
    name: string;
    identifier: string;
    issueCount: number;
  }>;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const getTypeConfig = (type?: string) => {
  const t = type?.toLowerCase() || '';
  if (t === 'bug') return { icon: Bug, color: '#ef4444' };
  if (t === 'milestone') return { icon: Milestone, color: '#a855f7' };
  if (t === 'feature') return { icon: Zap, color: '#22c55e' };
  if (t === 'story') return { icon: Bookmark, color: '#3b82f6' };
  return { icon: FileText, color: '#6b7280' };
};

const getPriorityIcon = (priority?: string) => {
  const p = priority?.toUpperCase() || '';
  if (p === 'URGENT') return { icon: Flag, color: 'text-red-500' };
  if (p === 'HIGH') return { icon: ArrowUp, color: 'text-amber-500' };
  if (p === 'MEDIUM') return { icon: Minus, color: 'text-blue-500' };
  if (p === 'LOW') return { icon: ArrowDown, color: 'text-slate-400' };
  return null;
};

const getStatusColor = (status?: string) => {
  const s = status?.toLowerCase() || '';
  if (s.includes('done') || s.includes('complete') || s.includes('closed')) return '#22c55e';
  if (s.includes('progress') || s.includes('review')) return '#3b82f6';
  if (s.includes('blocked')) return '#ef4444';
  return '#52525b';
};

export function DashboardClient({
  user,
  workspace,
  priorityIssues,
  projects,
}: DashboardClientProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    const event = new CustomEvent('open-ai-chat', { detail: { query } });
    window.dispatchEvent(event);
    setQuery('');
  };

  const quickActions = [
    { label: 'My Tasks', icon: ListTodo, query: 'Show my tasks' },
    { label: 'Create', icon: Plus, href: `/${workspace?.slug}/issues/new` },
    { label: 'Search', icon: Search, action: 'search' },
    { label: 'Projects', icon: FolderKanban, href: `/${workspace?.slug}/projects` },
  ];

  // AI-curated stats
  const overdueCount = priorityIssues.filter(i => i.dueDate && new Date(i.dueDate) < new Date()).length;
  const urgentCount = priorityIssues.filter(i => i.priority?.toUpperCase() === 'URGENT' || i.priority?.toUpperCase() === 'HIGH').length;

  return (
    <div className="min-h-full bg-[#09090b] p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Hero Section - Greeting + AI Input */}
        <div className="text-center pt-8 pb-4">
          <h1 className="text-2xl font-medium text-[#fafafa] mb-1">
            {getGreeting()}, {user.name.split(' ')[0]}
          </h1>
          <p className="text-sm text-[#52525b] mb-6">{workspace?.name}</p>

          {/* AI Command Input - Glassmorphism */}
          <form onSubmit={handleSubmit} className="max-w-xl mx-auto">
            <div className={cn(
              "relative flex items-center",
              "bg-white/[0.02] backdrop-blur-xl",
              "border border-white/[0.06] hover:border-white/[0.1]",
              "rounded-2xl transition-all duration-300",
              "focus-within:border-white/[0.15] focus-within:bg-white/[0.04]",
              "shadow-[0_0_40px_-10px_rgba(59,130,246,0.15)]"
            )}>
              <Sparkles className="absolute left-4 h-4 w-4 text-blue-400/60" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask AI anything..."
                className="w-full bg-transparent py-3.5 pl-11 pr-12 text-[#fafafa] placeholder:text-[#52525b] focus:outline-none text-sm"
              />
              <button
                type="submit"
                disabled={!query.trim()}
                className={cn(
                  "absolute right-2 p-2 rounded-xl transition-all duration-200",
                  query.trim() ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30" : "text-[#3f3f46]"
                )}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>

          {/* Quick Actions */}
          <div className="flex items-center justify-center gap-2 mt-4">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => {
                  if (action.query) {
                    const event = new CustomEvent('open-ai-chat', { detail: { query: action.query } });
                    window.dispatchEvent(event);
                  } else if (action.href) {
                    router.push(action.href);
                  } else if (action.action === 'search') {
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
                  }
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs",
                  "bg-white/[0.02] hover:bg-white/[0.05]",
                  "border border-white/[0.04] hover:border-white/[0.08]",
                  "text-[#71717a] hover:text-[#fafafa] transition-all"
                )}
              >
                <action.icon className="h-3 w-3" />
                {action.label}
              </button>
            ))}
          </div>
        </div>

        {/* AI Insights Bar - Glassmorphism */}
        {(overdueCount > 0 || urgentCount > 0) && (
          <div className={cn(
            "flex items-center gap-4 px-4 py-3 rounded-xl",
            "bg-gradient-to-r from-amber-500/[0.05] to-red-500/[0.05]",
            "border border-amber-500/10 backdrop-blur-sm"
          )}>
            <Brain className="h-4 w-4 text-amber-400/80" />
            <span className="text-xs text-[#a1a1aa]">
              <span className="text-amber-400">AI Insight:</span>
              {overdueCount > 0 && ` ${overdueCount} overdue task${overdueCount > 1 ? 's' : ''}`}
              {overdueCount > 0 && urgentCount > 0 && ' and'}
              {urgentCount > 0 && ` ${urgentCount} high priority item${urgentCount > 1 ? 's' : ''} need attention`}
            </span>
          </div>
        )}

        {/* Main Grid */}
        <div className="grid grid-cols-12 gap-4">

          {/* Priority Tasks - Takes 8 cols */}
          <div className={cn(
            "col-span-12 lg:col-span-8",
            "bg-white/[0.01] backdrop-blur-sm",
            "border border-white/[0.04] rounded-xl overflow-hidden"
          )}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04]">
              <div className="flex items-center gap-2">
                <Target className="h-3.5 w-3.5 text-[#52525b]" />
                <span className="text-[11px] font-medium text-[#71717a] uppercase tracking-wider">Needs Attention</span>
                {priorityIssues.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400">
                    {priorityIssues.length}
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  const event = new CustomEvent('open-ai-chat', { detail: { query: 'Show all my tasks' } });
                  window.dispatchEvent(event);
                }}
                className="text-[10px] text-[#52525b] hover:text-[#a1a1aa] flex items-center gap-1"
              >
                View all <ArrowRight className="h-2.5 w-2.5" />
              </button>
            </div>

            <div className="divide-y divide-white/[0.02]">
              {priorityIssues.length > 0 ? (
                priorityIssues.slice(0, 5).map((issue) => {
                  const typeConfig = getTypeConfig(issue.type);
                  const priorityInfo = getPriorityIcon(issue.priority);
                  const TypeIcon = typeConfig.icon;
                  const isOverdue = issue.dueDate && new Date(issue.dueDate) < new Date();

                  return (
                    <div
                      key={issue.id}
                      onClick={() => router.push(`/${workspace?.slug}/issues/${issue.key || issue.id}`)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 cursor-pointer",
                        "hover:bg-white/[0.02] transition-colors"
                      )}
                    >
                      <Circle
                        className="h-2 w-2 flex-shrink-0"
                        fill={getStatusColor(issue.status)}
                        style={{ color: getStatusColor(issue.status) }}
                      />
                      <TypeIcon className="h-3 w-3 flex-shrink-0" style={{ color: typeConfig.color }} />
                      {priorityInfo && <priorityInfo.icon className={cn('h-3 w-3 flex-shrink-0', priorityInfo.color)} />}
                      <span className="text-[10px] text-[#52525b] font-mono">{issue.key}</span>
                      <span className="text-xs text-[#e4e4e7] truncate flex-1">{issue.title}</span>
                      {issue.dueDate && (
                        <span className={cn(
                          "text-[10px] flex-shrink-0",
                          isOverdue ? "text-red-400" : "text-[#52525b]"
                        )}>
                          {format(new Date(issue.dueDate), 'MMM d')}
                        </span>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center py-10">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500/30 mb-2" />
                  <span className="text-xs text-[#52525b]">All caught up!</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar - Stats & Projects */}
          <div className="col-span-12 lg:col-span-4 space-y-4">

            {/* AI Stats Widget */}
            <div className={cn(
              "bg-gradient-to-br from-blue-500/[0.05] to-purple-500/[0.05]",
              "border border-white/[0.04] rounded-xl p-4 backdrop-blur-sm"
            )}>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-3.5 w-3.5 text-blue-400/80" />
                <span className="text-[11px] font-medium text-[#71717a] uppercase tracking-wider">Your Focus</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center">
                  <div className="text-2xl font-semibold text-[#fafafa]">{priorityIssues.length}</div>
                  <div className="text-[10px] text-[#52525b]">Active Tasks</div>
                </div>
                <div className="text-center">
                  <div className={cn("text-2xl font-semibold", overdueCount > 0 ? "text-red-400" : "text-emerald-400")}>
                    {overdueCount}
                  </div>
                  <div className="text-[10px] text-[#52525b]">Overdue</div>
                </div>
              </div>
            </div>

            {/* Projects Widget */}
            <div className={cn(
              "bg-white/[0.01] backdrop-blur-sm",
              "border border-white/[0.04] rounded-xl overflow-hidden"
            )}>
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04]">
                <div className="flex items-center gap-2">
                  <FolderKanban className="h-3.5 w-3.5 text-[#52525b]" />
                  <span className="text-[11px] font-medium text-[#71717a] uppercase tracking-wider">Projects</span>
                </div>
              </div>
              <div className="divide-y divide-white/[0.02]">
                {projects.slice(0, 4).map((project) => (
                  <Link
                    key={project.id}
                    href={`/${workspace?.slug}/projects/${project.identifier?.toLowerCase() || project.id}`}
                    className="flex items-center justify-between px-4 py-2 hover:bg-white/[0.02] transition-colors"
                  >
                    <span className="text-xs text-[#e4e4e7] truncate">{project.name}</span>
                    <span className="text-[10px] text-[#3f3f46]">{project.issueCount}</span>
                  </Link>
                ))}
                {projects.length === 0 && (
                  <div className="px-4 py-6 text-center">
                    <span className="text-[11px] text-[#52525b]">No projects</span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick AI Actions */}
            <div className={cn(
              "bg-white/[0.01] backdrop-blur-sm",
              "border border-white/[0.04] rounded-xl p-3"
            )}>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-3.5 w-3.5 text-purple-400/80" />
                <span className="text-[11px] font-medium text-[#71717a] uppercase tracking-wider">AI Actions</span>
              </div>
              <div className="space-y-1">
                {[
                  { label: 'Summarize my week', icon: Clock },
                  { label: 'What should I focus on?', icon: Target },
                ].map((action) => (
                  <button
                    key={action.label}
                    onClick={() => {
                      const event = new CustomEvent('open-ai-chat', { detail: { query: action.label } });
                      window.dispatchEvent(event);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left",
                      "hover:bg-white/[0.03] transition-colors text-[11px] text-[#71717a] hover:text-[#a1a1aa]"
                    )}
                  >
                    <action.icon className="h-3 w-3" />
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
