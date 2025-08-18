"use client";

import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  /**
   * Left side content
   */
  // Icon for the page (optional)
  icon?: LucideIcon;
  // Page title (required)
  title: string | React.ReactNode;
  // Subtitle or count text (optional)
  subtitle?: string | React.ReactNode;
  // Additional left-side content (optional)
  leftContent?: React.ReactNode;

  /**
   * Right side content  
   */
  // Search component (optional)
  search?: React.ReactNode;
  // Action buttons (optional)
  actions?: React.ReactNode;
  // Additional right-side content (optional)
  rightContent?: React.ReactNode;

  /**
   * Styling
   */
  className?: string;
  // Whether to show border at the bottom
  showBorder?: boolean;
}

export default function PageHeader({
  icon: Icon,
  title,
  subtitle,
  leftContent,
  search,
  actions,
  rightContent,
  className,
  showBorder = true
}: PageHeaderProps) {
  return (
    <div className={cn(
      "bg-[#101011] px-6 py-2",
      showBorder && "border-b border-[#1a1a1a]",
      className
    )}>
      <div className="flex items-center justify-between">
        {/* Left Side */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            {/* Icon and Title */}
            <div className="flex items-center gap-2">
              {Icon && (
                <Icon className="h-5 w-5 text-[#9ca3af]" />
              )}
              {typeof title === 'string' ? (
                <h1 className="text-xl font-semibold text-white">
                  {title}
                </h1>
              ) : (
                title
              )}
            </div>
            
            {/* Subtitle/Count */}
            {subtitle && (
              <span className="text-[#666] text-sm">
                {subtitle}
              </span>
            )}
          </div>

          {/* Additional Left Content */}
          {leftContent}
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-3">
          {/* Search */}
          {search}

          {/* Actions */}
          {actions}

          {/* Additional Right Content */}
          {rightContent}
        </div>
      </div>
    </div>
  );
}

// Predefined button styles for consistency
export const pageHeaderButtonStyles = {
  // Default ghost button style
  ghost: "h-6 px-2 text-[#7d8590] hover:text-[#e6edf3] text-xs border border-[#21262d] hover:border-[#30363d] bg-[#0d1117] hover:bg-[#161b22]",
  
  // Primary action button (green)
  primary: "h-6 px-2 text-[#238636] hover:text-[#2ea043] text-xs border border-[#21262d] hover:border-[#238636] bg-[#0d1117] hover:bg-[#0d1721]",
  
  // Update/Save button (blue)
  update: "h-6 px-2 text-[#8cc8ff] hover:text-[#58a6ff] text-xs border border-[#21262d] hover:border-[#30363d] bg-[#0d1117] hover:bg-[#161b22]",
  
  // Danger/Delete button (red)
  danger: "h-6 px-2 text-[#f85149] hover:text-[#ff6b6b] text-xs border border-[#21262d] hover:border-[#30363d] bg-[#0d1117] hover:bg-[#161b22]",
  
  // Reset button (muted)
  reset: "h-6 px-2 text-[#666] hover:text-[#999] text-xs border border-transparent hover:border-[#333]",

  // Active state for filter buttons
  active: "h-6 px-2 text-xs border",
  activeBlue: "border-[#58a6ff] text-[#58a6ff] bg-[#0d1421] hover:bg-[#0d1421] hover:border-[#58a6ff]",
  activeRed: "border-[#f85149] text-[#f85149] bg-[#21110f] hover:bg-[#21110f] hover:border-[#f85149]",
  activeGray: "border-[#a5a5a5] text-[#a5a5a5] bg-[#1a1a1a] hover:bg-[#1a1a1a] hover:border-[#a5a5a5]",
  
  // Inactive state for filter buttons
  inactive: "border-[#21262d] text-[#7d8590] hover:text-[#e6edf3] hover:border-[#30363d] bg-[#0d1117] hover:bg-[#161b22]"
};

// Search input styles for consistency
export const pageHeaderSearchStyles = "pl-7 w-48 bg-[#0d1117] border-[#21262d] text-white placeholder-[#666] focus:border-[#58a6ff] h-6 text-xs";
