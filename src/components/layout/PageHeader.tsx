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
  // Whether to disable backdrop blur (useful for modals)
  disableBlur?: boolean;
  // Whether to make the header sticky (useful for modals)
  sticky?: boolean;
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
  showBorder = true,
  disableBlur = false,
  sticky = false
}: PageHeaderProps) {
  // Determine if blur should be disabled (when disableBlur is true OR when sticky is true)
  const shouldDisableBlur = disableBlur || sticky;
  
  return (
    <div className={cn(
      // Base styling with glassmorphism (disabled if shouldDisableBlur is true)
      !shouldDisableBlur && "backdrop-blur-xl border-white/10",
      shouldDisableBlur && "border-white/10",
      // Background: use solid when sticky or disableBlur, otherwise glassmorphism
      shouldDisableBlur ? "bg-[#101011]" : "bg-black/40 md:bg-[#101011]",

      // Responsive padding and spacing
      "px-4 py-3 md:px-6 md:py-2",

      // Border styling
      showBorder && "border-b border-white/10 md:border-[#1a1a1a]",

      // Mobile-specific styling
      "max-md:sticky max-md:top-0 max-md:z-40 max-md:shadow-lg",
      
      // Sticky styling (for modal mode)
      sticky && "sticky top-0 z-50 shadow-lg",

      className
    )}
      style={shouldDisableBlur ? {
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        backgroundColor: '#101011',
      } : {
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      {/* Main Header Row */}
      <div className="flex items-center justify-between min-h-[32px]">
        {/* Left Side - Title with inline subtitle and buttons */}
        <div className="flex items-center gap-1 md:gap-4 min-w-0 flex-1">
          <div className="flex items-center gap-1 md:gap-3 min-w-0 flex-1">
            {/* Icon and Title */}
            <div className="flex items-center gap-1 md:gap-2 min-w-0">
              {Icon && (
                <Icon className="h-4 w-4 md:h-5 md:w-5 text-gray-400 shrink-0" />
              )}
              {typeof title === 'string' ? (
                <h1 className="text-xs sm:text-sm md:text-xl font-semibold text-white truncate">
                  {title}
                </h1>
              ) : (
                <div className="min-w-0">
                  {title}
                </div>
              )}
            </div>

            {/* Subtitle/Count - Responsive visibility */}
            {subtitle && (
              <span className="text-gray-400 text-xs md:text-sm shrink-0 hidden xs:inline">
                {subtitle}
              </span>
            )}

            {/* Left Content - Show inline with title, responsive spacing */}
            {leftContent && (
              <div className="flex items-center gap-0.5 sm:gap-1 md:gap-2 ml-0.5 sm:ml-1 md:ml-2">
                {leftContent}
              </div>
            )}
          </div>
        </div>

        {/* Right Side - Desktop only (search + actions) */}
        <div className="hidden md:flex items-center gap-3 shrink-0">
          {/* Search - Desktop */}
          {search && (
            <div>
              {search}
            </div>
          )}

          {/* Actions - Desktop */}
          {actions && (
            <div className="flex items-center gap-2">
              {actions}
            </div>
          )}

          {/* Additional Right Content */}
          {rightContent}
        </div>
      </div>

      {/* Mobile Second Row - Search + Action Buttons */}
      <div className="md:hidden">
        {/* Mobile: Search and Actions Row */}
        {(search || actions) && (
          <div className="mt-2 flex items-center gap-2">
            {/* Search - Mobile: Full width */}
            {search && (
              <div className="flex-1 max-w-xs">
                {search}
              </div>
            )}

            {/* Actions - Mobile: Icon only */}
            {actions && (
              <div className="flex items-center gap-1 ml-2">
                {actions}
              </div>
            )}
          </div>
        )}

        {/* Mobile: leftContent is now shown inline with title */}
      </div>
    </div>
  );
}

// Predefined button styles for consistency with mobile-first design
export const pageHeaderButtonStyles = {
  // Default ghost button style - Icon-only on mobile, with text on desktop
  ghost: cn(
    "h-7 px-2 md:h-6 text-xs flex items-center justify-center",
    "text-gray-400 hover:text-white",
    "border border-white/10 hover:border-white/20",
    "bg-white/5 hover:bg-white/10 backdrop-blur-sm",
    "rounded-md transition-all duration-200"
  ),

  // Primary action button (green) - Icon-only on mobile
  primary: cn(
    "h-7 px-2 md:h-6 text-xs flex items-center justify-center",
    "text-green-400 hover:text-green-300",
    "border border-green-500/20 hover:border-green-400/30",
    "bg-green-500/10 hover:bg-green-500/20 backdrop-blur-sm",
    "rounded-md transition-all duration-200"
  ),

  // Update/Save button (blue) - Icon-only on mobile
  update: cn(
    "h-7 px-2 md:h-6 text-xs flex items-center justify-center",
    "text-blue-400 hover:text-blue-300",
    "border border-blue-500/20 hover:border-blue-400/30",
    "bg-blue-500/10 hover:bg-blue-500/20 backdrop-blur-sm",
    "rounded-md transition-all duration-200"
  ),

  // Danger/Delete button (red) - Icon-only on mobile
  danger: cn(
    "h-7 px-2 md:h-6 text-xs flex items-center justify-center",
    "text-red-400 hover:text-red-300",
    "border border-red-500/20 hover:border-red-400/30",
    "bg-red-500/10 hover:bg-red-500/20 backdrop-blur-sm",
    "rounded-md transition-all duration-200"
  ),

  // Reset button (muted) - Icon-only on mobile
  reset: cn(
    "h-7 px-2 md:h-6 text-xs flex items-center justify-center",
    "text-gray-500 hover:text-gray-400",
    "border border-transparent hover:border-white/10",
    "bg-transparent hover:bg-white/5",
    "rounded-md transition-all duration-200"
  ),

  // Active state for filter buttons - Icon-only on mobile
  active: "h-7 px-2 md:h-6 text-xs border rounded-md backdrop-blur-sm flex items-center justify-center",
  activeBlue: cn(
    "border-blue-400/50 text-blue-300 bg-blue-500/20",
    "hover:bg-blue-500/25 hover:border-blue-400/60"
  ),
  activeRed: cn(
    "border-red-400/50 text-red-300 bg-red-500/20",
    "hover:bg-red-500/25 hover:border-red-400/60"
  ),
  activeGray: cn(
    "border-gray-400/50 text-gray-300 bg-white/20",
    "hover:bg-white/25 hover:border-gray-400/60"
  ),

  // Inactive state for filter buttons - Icon-only on mobile
  inactive: cn(
    "border-white/10 text-gray-400 hover:text-white",
    "hover:border-white/20 bg-white/5 hover:bg-white/10",
    "h-7 px-2 md:h-6 text-xs rounded-md flex items-center justify-center"
  )
};

// Search input styles for consistency - Mobile optimized
export const pageHeaderSearchStyles = cn(
  "pl-7 w-full sm:w-24 md:w-48",
  "bg-white/5 md:bg-[#0d1117] backdrop-blur-sm",
  "border-white/10 md:border-[#21262d]",
  "text-white placeholder-gray-500",
  "focus:border-white/30 md:focus:border-[#58a6ff]",
  "h-6 text-xs rounded-md",
  "transition-all duration-200"
);