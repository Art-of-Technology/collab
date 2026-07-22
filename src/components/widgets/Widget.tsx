"use client";

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, ExternalLink, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export interface WidgetProps {
  /** Widget title displayed in header */
  title: string;
  /** Icon component to display before title */
  icon?: React.ReactNode;
  /** Optional link when clicking the external link icon */
  expandHref?: string;
  /** Loading state */
  isLoading?: boolean;
  /** Empty state */
  isEmpty?: boolean;
  /** Message to show when empty */
  emptyMessage?: string;
  /** Empty state icon */
  emptyIcon?: React.ReactNode;
  /** Content to render in header right side */
  headerRight?: React.ReactNode;
  /** Whether the widget is collapsible */
  collapsible?: boolean;
  /** Default expanded state */
  defaultExpanded?: boolean;
  /** Whether the widget can be maximized to full width */
  maximizable?: boolean;
  /** Controlled maximized state */
  isMaximized?: boolean;
  /** Callback when maximized state changes */
  onMaximizedChange?: (maximized: boolean) => void;
  /** Widget content */
  children: React.ReactNode;
  /** Additional className for the widget container */
  className?: string;
  /** Whether to show border */
  bordered?: boolean;
  /** Compact mode - less padding */
  compact?: boolean;
}

export function Widget({
  title,
  icon,
  expandHref,
  isLoading = false,
  isEmpty = false,
  emptyMessage = 'No data available',
  emptyIcon,
  headerRight,
  collapsible = false,
  defaultExpanded = true,
  maximizable = true,
  isMaximized: controlledMaximized,
  onMaximizedChange,
  children,
  className,
  bordered = true,
  compact = false,
}: WidgetProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const [internalMaximized, setInternalMaximized] = useState(false);

  const isExpanded = internalExpanded;
  const isMaximized = controlledMaximized !== undefined ? controlledMaximized : internalMaximized;

  const handleToggle = () => {
    setInternalExpanded(!isExpanded);
  };

  const handleMaximize = () => {
    const newMaximized = !isMaximized;
    setInternalMaximized(newMaximized);
    onMaximizedChange?.(newMaximized);
  };

  return (
    <div
      className={cn(
        "bg-collab-900 rounded-lg overflow-hidden transition-all duration-300",
        bordered && "border border-collab-700",
        isMaximized && "col-span-full",
        className
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center justify-between",
          compact ? "px-3 py-2" : "px-4 py-2.5",
          "bg-collab-950"
        )}
      >
        <div className="flex items-center gap-2">
          {collapsible && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggle}
              className="h-5 w-5 p-0 text-collab-500/60 hover:text-collab-50 hover:bg-transparent"
            >
              {isExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </Button>
          )}

          {icon && (
            <div className="text-collab-500">
              {icon}
            </div>
          )}

          <h3 className="text-xs font-medium text-collab-400 uppercase tracking-wider">{title}</h3>
        </div>

        <div className="flex items-center gap-1">
          {headerRight}

          {maximizable && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMaximize}
              className="h-6 w-6 p-0 text-collab-500/60 hover:text-collab-50 hover:bg-collab-700"
              title={isMaximized ? 'Minimize' : 'Maximize'}
            >
              {isMaximized ? (
                <Minimize2 className="h-3 w-3" />
              ) : (
                <Maximize2 className="h-3 w-3" />
              )}
            </Button>
          )}

          {expandHref && (
            <Link href={expandHref}>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-collab-500/60 hover:text-collab-50 hover:bg-collab-700"
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Content */}
      <div
        className={cn(
          "transition-all duration-200 ease-in-out overflow-hidden",
          isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className={cn(compact ? "p-2" : "p-3")}>
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-collab-500/60" />
            </div>
          ) : isEmpty ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              {emptyIcon && (
                <div className="mb-2 text-collab-500/50">
                  {emptyIcon}
                </div>
              )}
              <p className="text-xs text-collab-500/60">{emptyMessage}</p>
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}

// Subcomponent for widget list items - more compact
export interface WidgetListItemProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  variant?: 'default' | 'danger' | 'warning' | 'success';
}

export function WidgetListItem({
  icon,
  title,
  subtitle,
  right,
  onClick,
  className,
  variant = 'default',
}: WidgetListItemProps) {
  const variantStyles = {
    default: 'hover:bg-collab-800',
    danger: 'hover:bg-red-500/5 border-l-2 border-red-500/50',
    warning: 'hover:bg-amber-500/5 border-l-2 border-amber-500/50',
    success: 'hover:bg-emerald-500/5 border-l-2 border-emerald-500/50',
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded transition-colors",
        onClick && "cursor-pointer",
        variantStyles[variant],
        className
      )}
      onClick={onClick}
    >
      {icon && (
        <div className="flex-shrink-0 text-collab-500/60">
          {icon}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-collab-50 truncate">{title}</p>
        {subtitle && (
          <p className="text-[11px] text-collab-500/60 truncate">{subtitle}</p>
        )}
      </div>

      {right && (
        <div className="flex-shrink-0 text-[11px] text-collab-500/60">
          {right}
        </div>
      )}
    </div>
  );
}

// Footer link - more subtle
export interface WidgetFooterLinkProps {
  href: string;
  label?: string;
}

export function WidgetFooterLink({ href, label = 'View all' }: WidgetFooterLinkProps) {
  return (
    <div className="pt-2 mt-2 border-t border-collab-700">
      <Link
        href={href}
        className="flex items-center justify-center gap-1 py-1 text-[11px] text-collab-500/60 hover:text-collab-400 transition-colors"
      >
        {label}
        <ExternalLink className="h-2.5 w-2.5" />
      </Link>
    </div>
  );
}

export default Widget;
