"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  iconBgColor?: string;
  backHref?: string;
  backLabel?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  colorIndicator?: string;
}

export function PageHeader({
  title,
  subtitle,
  icon,
  iconBgColor = '#1a1a1b',
  backHref,
  backLabel = 'Back',
  children,
  actions,
  onRefresh,
  isRefreshing,
  colorIndicator,
}: PageHeaderProps) {
  const router = useRouter();

  return (
    <div className="flex-none border-b border-[#1f1f1f]">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          {backHref && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(backHref)}
                className="h-8 px-2 text-[#6e7681] hover:text-[#e6edf3] hover:bg-[#1a1a1a]"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                {backLabel}
              </Button>
              <div className="w-px h-5 bg-[#1f1f1f]" />
            </>
          )}

          {colorIndicator && (
            <div
              className="w-1 h-8 rounded-full flex-shrink-0"
              style={{ backgroundColor: colorIndicator }}
            />
          )}

          {icon && (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: iconBgColor }}
            >
              {icon}
            </div>
          )}

          <div>
            <h1 className="text-sm font-medium text-[#e6edf3]">{title}</h1>
            {subtitle && (
              <p className="text-xs text-[#6e7681]">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="h-8 px-2 text-[#6e7681] hover:text-[#e6edf3] hover:bg-[#1a1a1a]"
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>
          )}
          {actions}
        </div>
      </div>
      {children}
    </div>
  );
}

interface PageHeaderTabsProps {
  tabs: Array<{
    id: string;
    label: string;
    count?: number;
  }>;
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function PageHeaderTabs({ tabs, activeTab, onTabChange }: PageHeaderTabsProps) {
  return (
    <div className="flex items-center gap-1 px-6 pb-3">
      <div className="flex items-center gap-1 rounded-lg border border-[#1f1f1f] p-0.5 bg-[#0d0d0e]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
              activeTab === tab.id
                ? "bg-[#1f1f1f] text-[#e6edf3]"
                : "text-[#6e7681] hover:text-[#8b949e]"
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 text-[#6e7681]">{tab.count}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export default PageHeader;
