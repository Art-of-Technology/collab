"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import {
  Grid,
  List,
  BarChart3,
  Calendar,
  ListFilter,
  SlidersHorizontal,
  Search,
  Plus,
  Save,
  MoreHorizontal,
  ChevronRight,
  Check,
  X,
  CircleDot,
  Flag,
  Blocks,
  User,
  UserPen,
  Tags,
  Clock,
  Activity,
  Circle,
  CheckCircle2,
  XCircle,
  Timer,
  Archive,
  Group,
  ArrowUpDown,
  Bell,
  BellOff,
  Copy,
  Link as LinkIcon,
  Trash2,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { getProjectStatuses } from '@/actions/status';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Scope, FilterKey, ViewFilters, ActionFilter } from '@/hooks/useViewFilterState';
import {
  resolveFilterValues,
  getFilterLabel,
  getFilterColor,
  type FilterMetadata,
} from './FilterChip';

// ─── Animation config ──────────────────────────────────────

const SPRING = { type: "spring" as const, stiffness: 400, damping: 30 };

// ─── View type icon map ────────────────────────────────────

const VIEW_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  KANBAN: Grid, LIST: List, TABLE: List, TIMELINE: BarChart3,
  GANTT: BarChart3, BOARD: Grid, PLANNING: Calendar, CALENDAR: Calendar,
  USER: List,
};

// ─── Status icon map ───────────────────────────────────────

const STATUS_ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  'circle': Circle,
  'archive': Archive,
  'check-circle-2': CheckCircle2,
  'timer': Timer,
  'x-circle': XCircle,
};

// ─── Filter categories ─────────────────────────────────────

interface FilterCategory {
  key: FilterKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const FILTER_CATEGORIES: FilterCategory[] = [
  { key: 'status', label: 'Status', icon: CircleDot },
  { key: 'priority', label: 'Priority', icon: Flag },
  { key: 'type', label: 'Type', icon: Blocks },
  { key: 'assignee', label: 'Assignee', icon: User },
  { key: 'reporter', label: 'Reporter', icon: UserPen },
  { key: 'labels', label: 'Labels', icon: Tags },
  { key: 'updatedAt', label: 'Updated', icon: Clock },
  { key: 'actions', label: 'Activity', icon: Activity },
];

// ─── Priority options ──────────────────────────────────────

const PRIORITY_OPTIONS = [
  { id: 'urgent', label: 'Urgent', color: '#ef4444' },
  { id: 'high', label: 'High', color: '#f97316' },
  { id: 'medium', label: 'Medium', color: '#eab308' },
  { id: 'low', label: 'Low', color: '#3b82f6' },
  { id: 'none', label: 'No priority', color: '#6b7280' },
];

// ─── Type options ──────────────────────────────────────────

const TYPE_OPTIONS = [
  { id: 'TASK', label: 'Task' },
  { id: 'BUG', label: 'Bug' },
  { id: 'FEATURE', label: 'Feature' },
  { id: 'IMPROVEMENT', label: 'Improvement' },
  { id: 'STORY', label: 'Story' },
  { id: 'EPIC', label: 'Epic' },
  { id: 'SUBTASK', label: 'Sub-task' },
];

// ─── Updated At options ────────────────────────────────────

const UPDATED_AT_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last-3-days', label: 'Last 3 days' },
  { id: 'last-7-days', label: 'Last 7 days' },
  { id: 'last-30-days', label: 'Last 30 days' },
];

// ─── Layout options ────────────────────────────────────────

const LAYOUT_OPTIONS = [
  { id: 'LIST', label: 'List', icon: List },
  { id: 'KANBAN', label: 'Board', icon: Grid },
  { id: 'TIMELINE', label: 'Timeline', icon: BarChart3 },
  { id: 'PLANNING', label: 'Planning', icon: Calendar },
];

// ─── Grouping options ──────────────────────────────────────

const GROUPING_OPTIONS: Record<string, Array<{ id: string; label: string }>> = {
  KANBAN: [
    { id: 'status', label: 'Status' },
    { id: 'priority', label: 'Priority' },
    { id: 'assignee', label: 'Assignee' },
    { id: 'type', label: 'Type' },
  ],
  LIST: [
    { id: 'none', label: 'No grouping' },
    { id: 'status', label: 'Status' },
    { id: 'priority', label: 'Priority' },
    { id: 'assignee', label: 'Assignee' },
    { id: 'type', label: 'Type' },
    { id: 'project', label: 'Project' },
    { id: 'label', label: 'Label' },
  ],
  DEFAULT: [
    { id: 'none', label: 'No grouping' },
    { id: 'status', label: 'Status' },
    { id: 'priority', label: 'Priority' },
    { id: 'assignee', label: 'Assignee' },
    { id: 'type', label: 'Type' },
    { id: 'project', label: 'Project' },
  ],
};

// ─── Ordering options ──────────────────────────────────────

const ORDERING_OPTIONS = [
  { id: 'manual', label: 'Manual' },
  { id: 'priority', label: 'Priority' },
  { id: 'created', label: 'Created' },
  { id: 'updated', label: 'Updated' },
  { id: 'dueDate', label: 'Due date' },
  { id: 'title', label: 'Alphabetical' },
];

// ─── Display properties ────────────────────────────────────

const DISPLAY_PROPERTIES = [
  { key: 'Priority', label: 'Priority' },
  { key: 'Status', label: 'Status' },
  { key: 'Assignee', label: 'Assignee' },
  { key: 'Labels', label: 'Labels' },
  { key: 'Due Date', label: 'Due Date' },
  { key: 'Project', label: 'Project' },
  { key: 'Reporter', label: 'Reporter' },
  { key: 'Created', label: 'Created' },
  { key: 'Updated', label: 'Updated' },
];

// ─── Scope config ──────────────────────────────────────────

const SCOPE_CONFIG: Array<{ value: Scope; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'backlog', label: 'Backlog' },
];

// ─── Shared dropdown styling ───────────────────────────────

const DM_CONTENT = "bg-collab-900 border-collab-700/80 shadow-2xl text-collab-100";
const DM_ITEM = "text-collab-300 focus:bg-white/[0.06] focus:text-collab-100 rounded-md";
const DM_SUB_TRIGGER = "text-collab-300 focus:bg-white/[0.06] focus:text-collab-100 data-[state=open]:bg-white/[0.06] rounded-md";
const DM_SEP = "bg-white/[0.06]";

// ─── Types ─────────────────────────────────────────────────

interface ViewTopBarProps {
  workspace: { id: string; name: string; slug?: string };
  view: {
    id: string;
    name: string;
    type: string;
    displayType: string;
    isDefault: boolean;
    isFavorite: boolean;
    isDynamic?: boolean;
    projects: Array<{ id: string; name: string; slug: string; issuePrefix: string; color?: string }>;
  };

  // Filter state
  scope: Scope;
  onScopeChange: (scope: Scope) => void;
  search: string;
  onSearchChange: (query: string) => void;
  filters: ViewFilters;
  onFilterChange: (key: FilterKey, values: string[] | ActionFilter[] | undefined) => void;
  onClearAllFilters: () => void;
  activeFilterCount: number;

  // Issue counts
  issueCounts: {
    allIssuesCount: number;
    activeIssuesCount: number;
    backlogIssuesCount: number;
  };
  filteredIssuesCount: number;

  // Data for selectors
  projectIds: string[];
  workspaceMembers: any[];
  workspaceLabels: any[];
  workspaceId: string;
  allProjects: any[];

  // Display config
  layout: string;
  onLayoutChange: (layout: string) => void;
  groupBy: string;
  onGroupByChange: (groupBy: string) => void;
  sortBy: string;
  onSortByChange: (sortBy: string) => void;
  displayProperties: string[];
  onDisplayPropertiesChange: (props: string[]) => void;
  onProjectIdsChange: (ids: string[]) => void;

  // View actions
  isDefaultView: boolean;
  hasChanges: boolean;
  onSave: () => void;
  onReset: () => void;

  // Overflow menu
  isFollowing: boolean;
  isTogglingFollow: boolean;
  onToggleFollow: () => void;
  onSaveAsNew: () => void;
  onDelete?: () => void;

  // New issue
  onNewIssue: () => void;

  // Label callback
  onLabelCreated?: (label: any) => void;
}

// ─── Component ─────────────────────────────────────────────

export default function ViewTopBar({
  workspace,
  view,
  scope,
  onScopeChange,
  search,
  onSearchChange,
  filters,
  onFilterChange,
  onClearAllFilters,
  activeFilterCount,
  issueCounts,
  filteredIssuesCount,
  projectIds,
  workspaceMembers,
  workspaceLabels,
  workspaceId,
  allProjects,
  layout,
  onLayoutChange,
  groupBy,
  onGroupByChange,
  sortBy,
  onSortByChange,
  displayProperties,
  onDisplayPropertiesChange,
  onProjectIdsChange,
  isDefaultView,
  hasChanges,
  onSave,
  onReset,
  isFollowing,
  isTogglingFollow,
  onToggleFollow,
  onSaveAsNew,
  onDelete,
  onNewIssue,
}: ViewTopBarProps) {
  // ─── Local state ──────────────────────────────────────────

  const [filterOpen, setFilterOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [filterSearch, setFilterSearch] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(!!search);
  const filterSearchRef = useRef<HTMLInputElement>(null);

  // ─── Data fetching ────────────────────────────────────────

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses', projectIds],
    queryFn: () => getProjectStatuses(projectIds),
    staleTime: 5 * 60 * 1000,
    enabled: projectIds.length > 0,
  });

  const uniqueStatuses = useMemo(
    () => Array.from(new Map(statuses.map(s => [s.name, s])).values()),
    [statuses],
  );

  // ─── Filter metadata for chip resolution ──────────────────

  const filterMetadata: FilterMetadata = useMemo(() => ({
    statuses,
    members: workspaceMembers,
    labels: workspaceLabels,
  }), [statuses, workspaceMembers, workspaceLabels]);

  // ─── Active filter chips ──────────────────────────────────

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; values: string[] }> = [];
    const simpleKeys: FilterKey[] = ['status', 'priority', 'type', 'assignee', 'reporter', 'labels', 'updatedAt'];

    for (const key of simpleKeys) {
      const values = filters[key] as string[] | undefined;
      if (values?.length) {
        chips.push({
          key,
          label: getFilterLabel(key),
          values: resolveFilterValues(key, values, filterMetadata),
        });
      }
    }

    if (filters.actions?.length) {
      chips.push({
        key: 'actions',
        label: getFilterLabel('actions'),
        values: filters.actions.map(a => a.actionType),
      });
    }

    return chips;
  }, [filters, filterMetadata]);

  // ─── Keyboard shortcut: F to open filter ──────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        e.preventDefault();
        setFilterOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ─── Reset filter search when dropdown closes ─────────────

  useEffect(() => {
    if (!filterOpen) setFilterSearch('');
  }, [filterOpen]);

  useEffect(() => {
    if (filterOpen) {
      setTimeout(() => filterSearchRef.current?.focus(), 50);
    }
  }, [filterOpen]);

  // ─── Filter helpers ───────────────────────────────────────

  const filteredCategories = useMemo(() => {
    if (!filterSearch) return FILTER_CATEGORIES;
    const q = filterSearch.toLowerCase();
    return FILTER_CATEGORIES.filter(c => c.label.toLowerCase().includes(q));
  }, [filterSearch]);

  const getCategoryCount = useCallback((key: FilterKey): number => {
    const val = filters[key];
    return Array.isArray(val) ? val.length : 0;
  }, [filters]);

  const toggleStatusFilter = useCallback((statusName: string) => {
    const current = (filters.status || []) as string[];
    const matchingIds = statuses.filter(s => s.name === statusName).map(s => s.id);
    const hasAny = matchingIds.some(id => current.includes(id));
    const newValues = hasAny
      ? current.filter(id => !matchingIds.includes(id))
      : [...current, ...matchingIds];
    onFilterChange('status', newValues.length ? newValues : undefined);
  }, [filters.status, statuses, onFilterChange]);

  const toggleSimpleFilter = useCallback((key: FilterKey, id: string) => {
    const current = (filters[key] || []) as string[];
    const newValues = current.includes(id)
      ? current.filter(v => v !== id)
      : [...current, id];
    onFilterChange(key, newValues.length ? newValues : undefined);
  }, [filters, onFilterChange]);

  const isFilterSelected = useCallback((key: FilterKey, id: string): boolean => {
    const current = filters[key];
    if (!Array.isArray(current)) return false;
    return (current as string[]).includes(id);
  }, [filters]);

  const isStatusSelected = useCallback((statusName: string): boolean => {
    const current = (filters.status || []) as string[];
    const matchingIds = statuses.filter(s => s.name === statusName).map(s => s.id);
    return matchingIds.some(id => current.includes(id));
  }, [filters.status, statuses]);

  // ─── Display helpers ──────────────────────────────────────

  const normalizedSortBy = sortBy === 'createdAt' ? 'created' : sortBy === 'updatedAt' ? 'updated' : sortBy;
  const groupingOptions = GROUPING_OPTIONS[layout] || GROUPING_OPTIONS.DEFAULT;
  const groupByLabel = groupingOptions.find(o => o.id === groupBy)?.label || groupBy;
  const sortByLabel = ORDERING_OPTIONS.find(o => o.id === normalizedSortBy)?.label || normalizedSortBy;

  const toggleProperty = useCallback((key: string) => {
    if (displayProperties.includes(key)) {
      onDisplayPropertiesChange(displayProperties.filter(p => p !== key));
    } else {
      onDisplayPropertiesChange([...displayProperties, key]);
    }
  }, [displayProperties, onDisplayPropertiesChange]);

  // ─── Search helpers ───────────────────────────────────────

  const handleSearchBlur = useCallback(() => {
    if (!search) setIsSearchExpanded(false);
  }, [search]);

  // ─── Scope count helper ───────────────────────────────────

  const getScopeCount = (s: Scope): number => {
    switch (s) {
      case 'all': return issueCounts.allIssuesCount;
      case 'active': return issueCounts.activeIssuesCount;
      case 'backlog': return issueCounts.backlogIssuesCount;
    }
  };

  // ─── Derived ──────────────────────────────────────────────

  const ViewIcon = VIEW_TYPE_ICONS[view.type] || VIEW_TYPE_ICONS[view.displayType] || List;
  const isPlanning = layout === 'PLANNING';

  // ─── Render sub-items for a filter category ───────────────

  const renderFilterSubItems = (catKey: FilterKey) => {
    switch (catKey) {
      case 'status':
        return uniqueStatuses.map(status => {
          const Icon = STATUS_ICON_MAP[status.iconName] || Circle;
          const selected = isStatusSelected(status.name);
          return (
            <DropdownMenuItem
              key={status.name}
              onSelect={e => e.preventDefault()}
              onClick={() => toggleStatusFilter(status.name)}
              className={cn(DM_ITEM, selected && "bg-white/[0.06] text-collab-50")}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: status.color }} />
              <span className="flex-1 truncate">{status.displayName}</span>
              {selected && <Check className="h-3.5 w-3.5 text-blue-400 shrink-0 ml-auto" />}
            </DropdownMenuItem>
          );
        });

      case 'priority':
        return PRIORITY_OPTIONS.map(opt => {
          const selected = isFilterSelected('priority', opt.id);
          return (
            <DropdownMenuItem
              key={opt.id}
              onSelect={e => e.preventDefault()}
              onClick={() => toggleSimpleFilter('priority', opt.id)}
              className={cn(DM_ITEM, selected && "bg-white/[0.06] text-collab-50")}
            >
              <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
              <span className="flex-1 truncate">{opt.label}</span>
              {selected && <Check className="h-3.5 w-3.5 text-blue-400 shrink-0 ml-auto" />}
            </DropdownMenuItem>
          );
        });

      case 'type':
        return TYPE_OPTIONS.map(opt => {
          const selected = isFilterSelected('type', opt.id);
          return (
            <DropdownMenuItem
              key={opt.id}
              onSelect={e => e.preventDefault()}
              onClick={() => toggleSimpleFilter('type', opt.id)}
              className={cn(DM_ITEM, selected && "bg-white/[0.06] text-collab-50")}
            >
              <Blocks className="h-3.5 w-3.5 shrink-0 text-purple-400" />
              <span className="flex-1 truncate">{opt.label}</span>
              {selected && <Check className="h-3.5 w-3.5 text-blue-400 shrink-0 ml-auto" />}
            </DropdownMenuItem>
          );
        });

      case 'assignee':
      case 'reporter':
        return [
          { id: 'unassigned', name: 'Unassigned' },
          ...workspaceMembers,
        ].map(member => {
          const selected = isFilterSelected(catKey, member.id);
          return (
            <DropdownMenuItem
              key={member.id}
              onSelect={e => e.preventDefault()}
              onClick={() => toggleSimpleFilter(catKey, member.id)}
              className={cn(DM_ITEM, selected && "bg-white/[0.06] text-collab-50")}
            >
              <div className="h-5 w-5 rounded-full bg-collab-700 flex items-center justify-center text-[10px] font-medium text-collab-300 shrink-0">
                {member.name?.charAt(0) || 'U'}
              </div>
              <span className="flex-1 truncate">{member.name || 'Unassigned'}</span>
              {selected && <Check className="h-3.5 w-3.5 text-blue-400 shrink-0 ml-auto" />}
            </DropdownMenuItem>
          );
        });

      case 'labels':
        return [
          { id: 'no-labels', name: 'No labels', color: '#6b7280' },
          ...workspaceLabels,
        ].map((label: any) => {
          const selected = isFilterSelected('labels', label.id);
          return (
            <DropdownMenuItem
              key={label.id}
              onSelect={e => e.preventDefault()}
              onClick={() => toggleSimpleFilter('labels', label.id)}
              className={cn(DM_ITEM, selected && "bg-white/[0.06] text-collab-50")}
            >
              <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: label.color || '#6b7280' }} />
              <span className="flex-1 truncate">{label.name}</span>
              {selected && <Check className="h-3.5 w-3.5 text-blue-400 shrink-0 ml-auto" />}
            </DropdownMenuItem>
          );
        });

      case 'updatedAt':
        return UPDATED_AT_OPTIONS.map(opt => {
          const selected = isFilterSelected('updatedAt', opt.id);
          return (
            <DropdownMenuItem
              key={opt.id}
              onSelect={e => e.preventDefault()}
              onClick={() => toggleSimpleFilter('updatedAt', opt.id)}
              className={cn(DM_ITEM, selected && "bg-white/[0.06] text-collab-50")}
            >
              <Clock className="h-3.5 w-3.5 shrink-0 text-orange-400" />
              <span className="flex-1 truncate">{opt.label}</span>
              {selected && <Check className="h-3.5 w-3.5 text-blue-400 shrink-0 ml-auto" />}
            </DropdownMenuItem>
          );
        });

      case 'actions':
        return (
          <div className="px-3 py-4 text-center text-collab-500 text-xs">
            Use the inline Activity selector for action filters.
          </div>
        );

      default:
        return null;
    }
  };

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="border-b border-white/[0.06] bg-collab-900">
      {/* ─── Row 1: Breadcrumb + Actions ─── */}
      <div className="flex items-center gap-2 h-11 px-4 md:px-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 min-w-0">
          <ViewIcon className="h-4 w-4 text-collab-500 shrink-0" />
          <Link
            href={`/${workspace.slug || workspace.id}/views`}
            className="text-[13px] text-collab-400 hover:text-collab-200 transition-colors truncate hover:bg-collab-700/50 px-1.5 py-0.5 -mx-1.5 rounded-md"
          >
            {workspace.name}
          </Link>
          <ChevronRight className="h-3 w-3 text-collab-600 shrink-0" />
          <span className="text-[13px] font-medium text-collab-100 truncate">
            {view.name}
          </span>
          {view.isDynamic && (
            <span className="text-[11px] text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded border border-violet-500/20 flex items-center gap-1 shrink-0">
              <Sparkles className="h-2.5 w-2.5" />
              AI
            </span>
          )}
          <span className="text-[12px] text-collab-500 tabular-nums shrink-0 ml-1">
            {filteredIssuesCount}
          </span>
        </div>

        <div className="flex-1" />

        {/* Actions row */}
        {!isPlanning && (
          <div className="flex items-center gap-0.5">
            {/* ────── Filter Dropdown ────── */}
            <DropdownMenu open={filterOpen} onOpenChange={setFilterOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "inline-flex items-center gap-1.5 h-7 px-2.5 text-[13px] rounded-md transition-all duration-150",
                    activeFilterCount > 0
                      ? "text-collab-100 hover:text-white"
                      : "text-collab-400 hover:text-collab-200",
                    "hover:bg-white/[0.06]"
                  )}
                >
                  <ListFilter className="h-3.5 w-3.5" />
                  <span>Filter</span>
                  {activeFilterCount > 0 ? (
                    <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[11px] font-medium rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      {activeFilterCount}
                    </span>
                  ) : (
                    <kbd className="text-[10px] font-sans bg-white/[0.04] text-collab-500 px-1 py-0.5 rounded border border-white/[0.08] leading-none ml-0.5">
                      F
                    </kbd>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className={cn("w-[260px] p-0", DM_CONTENT)}
                align="start"
                sideOffset={4}
              >
                {/* Sticky search */}
                {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
                <div
                  className="px-2.5 pt-2.5 pb-1.5"
                  onKeyDown={e => e.stopPropagation()}
                >
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-collab-500" />
                    <Input
                      ref={filterSearchRef}
                      placeholder="Filter..."
                      value={filterSearch}
                      onChange={e => setFilterSearch(e.target.value)}
                      className="pl-8 h-8 text-[13px] bg-white/[0.04] border-white/[0.08] text-collab-100 placeholder-collab-500 rounded-md focus:border-blue-500/50 focus:ring-0"
                    />
                  </div>
                </div>

                <DropdownMenuSeparator className={DM_SEP} />

                {/* Category submenus */}
                <div className="px-1 pb-1 pt-0.5">
                  {filteredCategories.map(cat => {
                    const CatIcon = cat.icon;
                    const count = getCategoryCount(cat.key);

                    return (
                      <DropdownMenuSub key={cat.key}>
                        <DropdownMenuSubTrigger
                          className={cn(
                            "w-full px-2.5 py-[7px] text-[13px]",
                            DM_SUB_TRIGGER,
                            count > 0 && "text-collab-100"
                          )}
                        >
                          <CatIcon className="h-3.5 w-3.5 shrink-0 text-collab-500" />
                          <span className="flex-1">{cat.label}</span>
                          {count > 0 && (
                            <span className="text-[11px] text-blue-400 tabular-nums mr-1">{count}</span>
                          )}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                          <DropdownMenuSubContent
                            className={cn(
                              "min-w-[220px] max-h-[320px] overflow-y-auto p-1",
                              DM_CONTENT,
                              "scrollbar-thin scrollbar-thumb-collab-700 scrollbar-track-transparent"
                            )}
                            sideOffset={8}
                          >
                            {/* Clear button for active filters */}
                            {count > 0 && (
                              <>
                                <div className="flex items-center justify-between px-2 py-1">
                                  <span className="text-[11px] text-collab-500 font-medium">{cat.label}</span>
                                  <button
                                    type="button"
                                    onClick={() => onFilterChange(cat.key, undefined)}
                                    className="text-[11px] text-collab-500 hover:text-collab-300 transition-colors px-1.5 py-0.5 rounded hover:bg-white/[0.06]"
                                  >
                                    Clear
                                  </button>
                                </div>
                                <DropdownMenuSeparator className={DM_SEP} />
                              </>
                            )}
                            {renderFilterSubItems(cat.key)}
                          </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                      </DropdownMenuSub>
                    );
                  })}

                  {filteredCategories.length === 0 && (
                    <div className="py-4 text-center text-collab-500 text-xs">No matching filters</div>
                  )}
                </div>

                {/* Clear all footer */}
                {activeFilterCount > 0 && (
                  <>
                    <DropdownMenuSeparator className={DM_SEP} />
                    <div className="px-2.5 py-2">
                      <button
                        type="button"
                        onClick={() => { onClearAllFilters(); setFilterOpen(false); }}
                        className="w-full text-[12px] text-collab-500 hover:text-collab-300 transition-colors text-center py-1 rounded hover:bg-white/[0.06]"
                      >
                        Clear all filters
                      </button>
                    </div>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* ────── Display Dropdown ────── */}
            <DropdownMenu open={displayOpen} onOpenChange={setDisplayOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "inline-flex items-center gap-1.5 h-7 px-2.5 text-[13px] rounded-md transition-all duration-150",
                    hasChanges
                      ? "text-blue-300 hover:text-blue-200"
                      : "text-collab-400 hover:text-collab-200",
                    "hover:bg-white/[0.06]"
                  )}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>Display</span>
                  {hasChanges && <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className={cn("w-[300px] p-0", DM_CONTENT)}
                align="end"
                sideOffset={4}
                onCloseAutoFocus={e => e.preventDefault()}
              >
                {/* Layout toggle with Framer Motion sliding pill */}
                <div className="px-3 pt-3 pb-2">
                  <div className="relative flex p-0.5 bg-white/[0.04] rounded-md border border-white/[0.06]">
                    {LAYOUT_OPTIONS.map(opt => {
                      const LIcon = opt.icon;
                      const isActive = layout === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onLayoutChange(opt.id)}
                          className={cn(
                            "flex-1 relative z-10 flex items-center justify-center gap-1.5 py-1.5 text-[12px] rounded transition-colors duration-150",
                            isActive ? "text-collab-50" : "text-collab-500 hover:text-collab-300"
                          )}
                        >
                          {isActive && (
                            <motion.div
                              layoutId="layout-indicator"
                              className="absolute inset-0 bg-white/[0.10] rounded shadow-sm"
                              transition={SPRING}
                            />
                          )}
                          <span className="relative z-10 flex items-center gap-1.5">
                            <LIcon className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">{opt.label}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <DropdownMenuSeparator className={cn(DM_SEP, "mx-3")} />

                {/* Grouping & Ordering submenus */}
                <div className="py-0.5">
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className={cn("mx-1 px-2 py-[7px] text-[13px]", DM_SUB_TRIGGER)}>
                      <Group className="h-3.5 w-3.5 text-collab-500 shrink-0" />
                      <span className="flex-1 text-collab-300">Grouping</span>
                      <span className="text-[12px] text-collab-500 mr-1">{groupByLabel}</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent className={cn("min-w-[180px] p-1", DM_CONTENT)} sideOffset={8}>
                        {groupingOptions.map(opt => (
                          <DropdownMenuItem
                            key={opt.id}
                            onSelect={e => e.preventDefault()}
                            onClick={() => onGroupByChange(opt.id)}
                            className={cn(DM_ITEM, groupBy === opt.id && "bg-white/[0.06] text-collab-50")}
                          >
                            <span className="flex-1">{opt.label}</span>
                            {groupBy === opt.id && <Check className="h-3.5 w-3.5 text-blue-400 shrink-0 ml-auto" />}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>

                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className={cn("mx-1 px-2 py-[7px] text-[13px]", DM_SUB_TRIGGER)}>
                      <ArrowUpDown className="h-3.5 w-3.5 text-collab-500 shrink-0" />
                      <span className="flex-1 text-collab-300">Ordering</span>
                      <span className="text-[12px] text-collab-500 mr-1">{sortByLabel}</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent className={cn("min-w-[180px] p-1", DM_CONTENT)} sideOffset={8}>
                        {ORDERING_OPTIONS.map(opt => (
                          <DropdownMenuItem
                            key={opt.id}
                            onSelect={e => e.preventDefault()}
                            onClick={() => onSortByChange(opt.id)}
                            className={cn(DM_ITEM, normalizedSortBy === opt.id && "bg-white/[0.06] text-collab-50")}
                          >
                            <span className="flex-1">{opt.label}</span>
                            {normalizedSortBy === opt.id && <Check className="h-3.5 w-3.5 text-blue-400 shrink-0 ml-auto" />}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>
                </div>

                <DropdownMenuSeparator className={cn(DM_SEP, "mx-3")} />

                {/* Properties grid */}
                <div className="px-3 py-2">
                  <div className="text-[11px] font-medium text-collab-500 uppercase tracking-wider mb-2">Properties</div>
                  <div className="flex flex-wrap gap-1.5">
                    {DISPLAY_PROPERTIES.map(prop => {
                      const isActive = displayProperties.includes(prop.key);
                      return (
                        <button
                          key={prop.key}
                          type="button"
                          onClick={() => toggleProperty(prop.key)}
                          className={cn(
                            "px-2.5 py-1 text-[12px] rounded-md border transition-all duration-150",
                            isActive
                              ? "bg-blue-500/10 border-blue-500/30 text-blue-300"
                              : "bg-transparent border-white/[0.06] text-collab-500 hover:text-collab-300 hover:border-white/[0.10]"
                          )}
                        >
                          {prop.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Projects (non-default views with multiple projects) */}
                {!isDefaultView && allProjects.length > 1 && (
                  <>
                    <DropdownMenuSeparator className={cn(DM_SEP, "mx-3")} />
                    <div className="px-3 py-2">
                      <div className="text-[11px] font-medium text-collab-500 uppercase tracking-wider mb-2">Projects</div>
                      <div className="max-h-[140px] overflow-y-auto space-y-0.5 scrollbar-thin scrollbar-thumb-collab-700 scrollbar-track-transparent">
                        {allProjects.map((project: any) => {
                          const isProjectSelected = projectIds.includes(project.id);
                          return (
                            <button
                              key={project.id}
                              type="button"
                              onClick={() => {
                                if (isProjectSelected) {
                                  onProjectIdsChange(projectIds.filter(id => id !== project.id));
                                } else {
                                  onProjectIdsChange([...projectIds, project.id]);
                                }
                              }}
                              className={cn(
                                "w-full flex items-center gap-2 px-2 py-1.5 text-[13px] rounded-md transition-colors text-left",
                                isProjectSelected
                                  ? "text-collab-100"
                                  : "text-collab-400 hover:text-collab-200 hover:bg-white/[0.04]"
                              )}
                            >
                              <div
                                className="h-2.5 w-2.5 rounded shrink-0"
                                style={{ backgroundColor: project.color || '#6b7280' }}
                              />
                              <span className="flex-1 truncate">{project.name}</span>
                              {isProjectSelected && <Check className="h-3 w-3 text-blue-400 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                {/* Footer — Reset / Save */}
                {hasChanges && (
                  <>
                    <DropdownMenuSeparator className={DM_SEP} />
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => { onReset(); setDisplayOpen(false); }}
                        className="flex items-center gap-1.5 text-[12px] text-collab-500 hover:text-collab-300 transition-colors px-2 py-1 rounded hover:bg-white/[0.06]"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Reset
                      </button>
                      <div className="flex-1" />
                      <button
                        type="button"
                        onClick={() => { onSave(); setDisplayOpen(false); }}
                        className="flex items-center gap-1.5 text-[12px] text-blue-400 hover:text-blue-300 transition-colors px-2.5 py-1 rounded bg-blue-500/10 hover:bg-blue-500/15 border border-blue-500/20"
                      >
                        <Save className="h-3 w-3" />
                        Set default
                      </button>
                    </div>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Separator */}
            <div className="w-px h-4 bg-white/[0.08] mx-0.5" />

            {/* Search toggle */}
            <div className="flex items-center shrink-0">
              {isSearchExpanded ? (
                <div className="relative flex items-center">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-collab-500 z-10" />
                  <Input
                    autoFocus
                    placeholder="Search issues..."
                    value={search}
                    onChange={e => onSearchChange(e.target.value)}
                    onBlur={handleSearchBlur}
                    className="pl-8 w-40 md:w-52 bg-white/[0.04] border-white/[0.08] text-collab-100 placeholder-collab-500 focus:border-blue-500/40 h-7 text-[13px] rounded-md transition-all duration-200"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => { onSearchChange(''); setIsSearchExpanded(false); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-collab-500 hover:text-white transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsSearchExpanded(true)}
                  className="h-7 w-7 flex items-center justify-center rounded-md text-collab-400 hover:text-collab-200 hover:bg-white/[0.06] transition-all duration-150"
                >
                  <Search className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Separator */}
            <div className="w-px h-4 bg-white/[0.08] mx-0.5" />

            {/* ────── Overflow Menu ────── */}
            <DropdownMenu open={overflowOpen} onOpenChange={setOverflowOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-7 w-7 flex items-center justify-center rounded-md text-collab-400 hover:text-collab-200 hover:bg-white/[0.06] transition-all duration-150"
                  aria-label="View options"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className={cn("w-[220px] p-1.5", DM_CONTENT)}
                align="end"
                sideOffset={4}
              >
                <DropdownMenuItem
                  onClick={() => { onToggleFollow(); setOverflowOpen(false); }}
                  disabled={isTogglingFollow}
                  className={DM_ITEM}
                >
                  {isFollowing ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                  <span>{isFollowing ? 'Unfollow' : 'Follow'}</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator className={DM_SEP} />

                <DropdownMenuItem
                  onClick={() => { onSaveAsNew(); setOverflowOpen(false); }}
                  className={DM_ITEM}
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>Duplicate view...</span>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    setOverflowOpen(false);
                  }}
                  className={DM_ITEM}
                >
                  <LinkIcon className="h-3.5 w-3.5" />
                  <span>Copy link</span>
                </DropdownMenuItem>

                {onDelete && !isDefaultView && (
                  <>
                    <DropdownMenuSeparator className={DM_SEP} />
                    <DropdownMenuItem
                      onClick={() => { onDelete(); setOverflowOpen(false); }}
                      className="text-red-400 focus:bg-red-500/10 focus:text-red-300 rounded-md"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete view</span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* New Issue */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2.5 text-[13px] text-collab-400 hover:text-collab-200 hover:bg-white/[0.06]"
              onClick={onNewIssue}
            >
              <Plus className="h-3 w-3 md:mr-1" />
              <span className="hidden md:inline ml-1">New Issue</span>
            </Button>
          </div>
        )}
      </div>

      {/* ─── Row 2: Scope pills + Active filter chips ─── */}
      {!isPlanning && (
        <div className="px-4 md:px-6 py-1.5">
          <div className="flex items-center gap-1 min-h-[32px]">
            {/* Scope pills with sliding indicator */}
            <div className="flex items-center gap-0.5 shrink-0 relative">
              {SCOPE_CONFIG.map(({ value, label }) => {
                const isActive = scope === value;
                const count = getScopeCount(value);
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onScopeChange(value)}
                    className={cn(
                      "relative h-7 px-2.5 text-[12px] rounded-md flex items-center gap-1.5 z-10 transition-colors duration-150",
                      isActive
                        ? "text-collab-100 font-medium"
                        : "text-collab-500 hover:text-collab-300"
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="scope-indicator"
                        className="absolute inset-0 bg-white/[0.08] rounded-md"
                        transition={SPRING}
                      />
                    )}
                    <span className="relative z-10">{label}</span>
                    <span className={cn(
                      "relative z-10 text-[11px] tabular-nums",
                      isActive ? "text-collab-400" : "text-collab-600"
                    )}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Separator between scope and chips */}
            {activeChips.length > 0 && (
              <div className="w-px h-4 bg-white/[0.08] mx-1 shrink-0" />
            )}

            {/* Active filter chips */}
            <AnimatePresence mode="popLayout">
              {activeChips.map(({ key, label, values }) => (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={SPRING}
                >
                  <div
                    className={cn(
                      "group inline-flex items-center gap-1 h-6 px-2 text-[12px] rounded-md border transition-colors cursor-default",
                      getFilterColor(key)
                    )}
                  >
                    <span className="font-medium opacity-70">{label}:</span>
                    <span className="truncate max-w-[140px]">
                      {values.length <= 2 ? values.join(', ') : `${values.length} selected`}
                    </span>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        onFilterChange(key as FilterKey, undefined);
                      }}
                      className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity rounded-sm"
                      aria-label={`Remove ${label} filter`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Clear all */}
            {activeChips.length > 1 && (
              <button
                type="button"
                onClick={onClearAllFilters}
                className="text-[11px] text-collab-500 hover:text-collab-300 transition-colors px-1.5 py-0.5 rounded hover:bg-white/[0.04]"
              >
                Clear all
              </button>
            )}

            {/* Right spacer */}
            <div className="flex-1" />
          </div>
        </div>
      )}
    </div>
  );
}
