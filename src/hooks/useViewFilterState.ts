"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

// Re-export for consumers
export interface ActionFilter {
  actionType: string;
  subConditions?: {
    type: 'to' | 'from' | 'by';
    values: string[];
  };
}

export interface ViewFilters {
  status?: string[];
  priority?: string[];
  type?: string[];
  assignee?: string[];
  reporter?: string[];
  labels?: string[];
  project?: string[];
  updatedAt?: string[];
  actions?: ActionFilter[];
}

export type FilterKey = keyof ViewFilters;

export type Scope = 'all' | 'active' | 'backlog';

export interface ViewConfig {
  layout: string;
  groupBy: string;
  sortBy: string;
  displayProperties: string[];
  projectIds: string[];
}

export interface ViewFilterState {
  scope: Scope;
  search: string;
  filters: ViewFilters;
  config: ViewConfig;
}

// ─── URL Serialization ───────────────────────────────────

const SIMPLE_FILTER_KEYS: FilterKey[] = [
  'status', 'priority', 'type', 'assignee', 'reporter', 'labels', 'project', 'updatedAt'
];

function serializeArrayParam(arr: string[]): string {
  return arr.join(',');
}

function deserializeArrayParam(value: string | null): string[] | undefined {
  if (!value) return undefined;
  return value.split(',').filter(Boolean);
}

function serializeActions(actions: ActionFilter[]): string {
  // Compact JSON — only include non-empty sub-conditions
  return btoa(JSON.stringify(actions));
}

function deserializeActions(value: string | null): ActionFilter[] | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(atob(value));
  } catch {
    return undefined;
  }
}

// ─── Merge Logic ─────────────────────────────────────────

function arraysEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

function mergeFiltersFromUrl(
  savedFilters: ViewFilters,
  searchParams: URLSearchParams,
): ViewFilters {
  const merged: ViewFilters = { ...savedFilters };

  for (const key of SIMPLE_FILTER_KEYS) {
    const urlValue = deserializeArrayParam(searchParams.get(key));
    if (urlValue !== undefined) {
      (merged as any)[key] = urlValue;
    }
  }

  const actionsUrl = deserializeActions(searchParams.get('actions'));
  if (actionsUrl !== undefined) {
    merged.actions = actionsUrl;
  }

  return merged;
}

// ─── Hook ────────────────────────────────────────────────

interface UseViewFilterStateOptions {
  view: {
    id: string;
    displayType: string;
    filters: any;
    sorting?: { field: string; direction: string };
    grouping?: { field: string };
    fields?: string[];
    projects: Array<{ id: string; name: string; slug: string; issuePrefix: string; color?: string }>;
    projectIds?: string[];
    isDynamic?: boolean;
  };
}

export function useViewFilterState({ view }: UseViewFilterStateOptions) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const isInitialMount = useRef(true);

  // ─── Saved view defaults (DB state) ──────────────────

  const savedFilters = useMemo<ViewFilters>(() => {
    const f = view.filters || {};
    return {
      status: f.status || undefined,
      priority: f.priority || undefined,
      type: f.type || undefined,
      assignee: f.assignee || undefined,
      reporter: f.reporter || undefined,
      labels: f.labels || undefined,
      project: f.project || undefined,
      updatedAt: f.updatedAt || undefined,
      actions: f.actions || undefined,
    };
  }, [view.filters]);

  const savedConfig = useMemo<ViewConfig>(() => ({
    layout: view.displayType,
    groupBy: view.grouping?.field || 'none',
    sortBy: 'manual',
    displayProperties: Array.isArray(view.fields) ? view.fields : ['Priority', 'Status', 'Assignee'],
    projectIds: view.projectIds?.length ? view.projectIds : view.projects.map(p => p.id),
  }), [view.displayType, view.grouping?.field, view.fields, view.projects, view.projectIds]);

  // ─── Active state (merged: saved + URL overrides) ────

  const activeFilters = useMemo<ViewFilters>(() => {
    return mergeFiltersFromUrl(savedFilters, searchParams);
  }, [savedFilters, searchParams]);

  const scope = useMemo<Scope>(() => {
    const s = searchParams.get('scope');
    if (s === 'active' || s === 'backlog') return s;
    return 'all';
  }, [searchParams]);

  const search = useMemo(() => {
    return searchParams.get('search') || '';
  }, [searchParams]);

  const activeConfig = useMemo<ViewConfig>(() => {
    const layout = searchParams.get('layout') || savedConfig.layout;
    const groupBy = searchParams.get('groupBy') || savedConfig.groupBy;
    const sortBy = searchParams.get('sortBy') || savedConfig.sortBy;
    const propsParam = searchParams.get('properties');
    const displayProperties = propsParam ? propsParam.split(',') : savedConfig.displayProperties;
    const projParam = searchParams.get('projectIds');
    const projectIds = projParam ? projParam.split(',') : savedConfig.projectIds;
    return { layout, groupBy, sortBy, displayProperties, projectIds };
  }, [searchParams, savedConfig]);

  // ─── URL Update Helpers ──────────────────────────────

  const buildParams = useCallback((updater: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    updater(params);
    // Clean empty params
    for (const [key, value] of Array.from(params.entries())) {
      if (!value) params.delete(key);
    }
    return params;
  }, [searchParams]);

  const pushParams = useCallback((params: URLSearchParams) => {
    const str = params.toString();
    const url = str ? `${pathname}?${str}` : pathname;
    router.replace(url, { scroll: false });
  }, [pathname, router]);

  // ─── Filter Setters ──────────────────────────────────

  const setFilter = useCallback((key: FilterKey, values: string[] | ActionFilter[] | undefined) => {
    const params = buildParams((p) => {
      if (key === 'actions') {
        const actions = values as ActionFilter[] | undefined;
        const savedActions = savedFilters.actions;
        if (!actions?.length) {
          p.delete('actions');
        } else if (JSON.stringify(actions) === JSON.stringify(savedActions)) {
          p.delete('actions');
        } else {
          p.set('actions', serializeActions(actions));
        }
      } else {
        const arr = values as string[] | undefined;
        const savedArr = savedFilters[key] as string[] | undefined;
        if (!arr?.length) {
          p.delete(key);
        } else if (arraysEqual(arr, savedArr)) {
          p.delete(key); // Matches saved default, no override needed
        } else {
          p.set(key, serializeArrayParam(arr));
        }
      }
    });
    pushParams(params);
  }, [buildParams, pushParams, savedFilters]);

  const setScope = useCallback((newScope: Scope) => {
    const params = buildParams((p) => {
      if (newScope === 'all') {
        p.delete('scope');
      } else {
        p.set('scope', newScope);
      }
    });
    pushParams(params);
  }, [buildParams, pushParams]);

  const setSearch = useCallback((query: string) => {
    const params = buildParams((p) => {
      if (!query) {
        p.delete('search');
      } else {
        p.set('search', query);
      }
    });
    pushParams(params);
  }, [buildParams, pushParams]);

  const setConfigField = useCallback(<K extends keyof ViewConfig>(key: K, value: ViewConfig[K]) => {
    const params = buildParams((p) => {
      const savedValue = savedConfig[key];
      if (key === 'displayProperties' || key === 'projectIds') {
        const arr = value as string[];
        const savedArr = savedValue as string[];
        if (arraysEqual(arr, savedArr)) {
          p.delete(key === 'displayProperties' ? 'properties' : 'projectIds');
        } else {
          p.set(key === 'displayProperties' ? 'properties' : 'projectIds', arr.join(','));
        }
      } else {
        if (value === savedValue) {
          p.delete(key);
        } else {
          p.set(key, value as string);
        }
      }
    });
    pushParams(params);
  }, [buildParams, pushParams, savedConfig]);

  // ─── Convenience Setters ─────────────────────────────

  const setLayout = useCallback((layout: string) => setConfigField('layout', layout), [setConfigField]);
  const setGroupBy = useCallback((groupBy: string) => setConfigField('groupBy', groupBy), [setConfigField]);
  const setSortBy = useCallback((sortBy: string) => setConfigField('sortBy', sortBy), [setConfigField]);
  const setDisplayProperties = useCallback((props: string[]) => setConfigField('displayProperties', props), [setConfigField]);
  const setProjectIds = useCallback((ids: string[]) => setConfigField('projectIds', ids), [setConfigField]);

  // ─── Bulk Operations ─────────────────────────────────

  const clearAllFilters = useCallback(() => {
    const params = buildParams((p) => {
      for (const key of SIMPLE_FILTER_KEYS) p.delete(key);
      p.delete('actions');
      p.delete('scope');
      p.delete('search');
    });
    pushParams(params);
  }, [buildParams, pushParams]);

  const resetAll = useCallback(() => {
    // Remove ALL overrides — go back to pure saved view
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  // ─── Derived State ───────────────────────────────────

  const activeFilterCount = useMemo(() => {
    let count = 0;
    for (const key of SIMPLE_FILTER_KEYS) {
      const arr = activeFilters[key] as string[] | undefined;
      if (arr?.length) count++;
    }
    if (activeFilters.actions?.length) count++;
    return count;
  }, [activeFilters]);

  const hasActiveFilters = activeFilterCount > 0 || scope !== 'all' || search !== '';

  const hasChanges = useMemo(() => {
    // Check if ANY URL params override the saved view
    return searchParams.toString() !== '';
  }, [searchParams]);

  const hasFilterChanges = useMemo(() => {
    for (const key of SIMPLE_FILTER_KEYS) {
      const active = activeFilters[key] as string[] | undefined;
      const saved = savedFilters[key] as string[] | undefined;
      if (!arraysEqual(active || [], saved || [])) return true;
    }
    if (JSON.stringify(activeFilters.actions || []) !== JSON.stringify(savedFilters.actions || [])) return true;
    return false;
  }, [activeFilters, savedFilters]);

  const hasConfigChanges = useMemo(() => {
    return (
      activeConfig.layout !== savedConfig.layout ||
      activeConfig.groupBy !== savedConfig.groupBy ||
      activeConfig.sortBy !== savedConfig.sortBy ||
      !arraysEqual(activeConfig.displayProperties, savedConfig.displayProperties) ||
      !arraysEqual(activeConfig.projectIds, savedConfig.projectIds)
    );
  }, [activeConfig, savedConfig]);

  // ─── Data for save ───────────────────────────────────

  const getFiltersForSave = useCallback((): Record<string, any> => {
    const result: Record<string, any> = {};
    for (const key of SIMPLE_FILTER_KEYS) {
      const arr = activeFilters[key] as string[] | undefined;
      if (arr?.length) result[key] = arr;
    }
    if (activeFilters.actions?.length) result.actions = activeFilters.actions;
    return result;
  }, [activeFilters]);

  const getConfigForSave = useCallback(() => ({
    displayType: activeConfig.layout,
    grouping: { field: activeConfig.groupBy },
    sorting: { field: activeConfig.sortBy, direction: 'desc' },
    fields: activeConfig.displayProperties,
    projectIds: activeConfig.projectIds,
    filters: getFiltersForSave(),
  }), [activeConfig, getFiltersForSave]);

  // ─── Reset URL on view change ────────────────────────

  const prevViewId = useRef(view.id);
  useEffect(() => {
    if (prevViewId.current !== view.id) {
      prevViewId.current = view.id;
      // Don't clear URL on initial mount
      if (!isInitialMount.current) {
        router.replace(pathname, { scroll: false });
      }
    }
    isInitialMount.current = false;
  }, [view.id, pathname, router]);

  return {
    // State
    scope,
    search,
    filters: activeFilters,
    config: activeConfig,

    // Filter setters
    setFilter,
    setScope,
    setSearch,
    clearAllFilters,

    // Config setters
    setLayout,
    setGroupBy,
    setSortBy,
    setDisplayProperties,
    setProjectIds,

    // Bulk
    resetAll,

    // Derived
    activeFilterCount,
    hasActiveFilters,
    hasChanges,
    hasFilterChanges,
    hasConfigChanges,

    // For save operations
    getFiltersForSave,
    getConfigForSave,

    // Saved defaults (for comparison)
    savedFilters,
    savedConfig,
  };
}
