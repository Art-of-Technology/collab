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
      // Base styling with glassmorphism
      "backdrop-blur-xl border-white/10",
      "bg-black/40 md:bg-[#101011]", // Glassmorphism on mobile, solid on desktop
      
      // Responsive padding and spacing
      "px-4 py-3 md:px-6 md:py-2",
      
      // Border styling
      showBorder && "border-b border-white/10 md:border-[#1a1a1a]",
      
      // Mobile-specific styling
      "max-md:sticky max-md:top-0 max-md:z-40 max-md:shadow-lg",
      
      className
    )}
    style={{
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
    }}
    >
      <div className="flex items-center justify-between">
        {/* Left Side */}
        <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            {/* Icon and Title */}
            <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
              {Icon && (
                <Icon className="h-4 w-4 md:h-5 md:w-5 text-gray-400 shrink-0" />
              )}
              {typeof title === 'string' ? (
                <h1 className="text-lg md:text-xl font-semibold text-white truncate">
                  {title}
                </h1>
              ) : (
                <div className="min-w-0 flex-1">
                  {title}
                </div>
              )}
            </div>
            
            {/* Subtitle/Count - Hide on small mobile */}
            {subtitle && (
              <span className="text-gray-500 text-xs md:text-sm hidden sm:inline-block shrink-0">
                {subtitle}
              </span>
            )}
          </div>

          {/* Additional Left Content - Hide on mobile if too crowded */}
          {leftContent && (
            <div className="hidden md:block">
              {leftContent}
            </div>
          )}
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          {/* Search - Responsive sizing */}
          {search && (
            <div className="hidden sm:block">
              {search}
            </div>
          )}

          {/* Actions - Compact on mobile */}
          {actions && (
            <div className="flex items-center gap-1.5 md:gap-2">
              {actions}
            </div>
          )}

          {/* Additional Right Content */}
          {rightContent}
        </div>
      </div>
      
      {/* Mobile: Show subtitle below on small screens */}
      {subtitle && (
        <div className="sm:hidden mt-1">
          <span className="text-gray-500 text-xs">
            {subtitle}
          </span>
        </div>
      )}
      
      {/* Mobile: Show left content below if present */}
      {leftContent && (
        <div className="md:hidden mt-2">
          {leftContent}
        </div>
      )}
    </div>
  );
}

// Predefined button styles for consistency with mobile-first design
export const pageHeaderButtonStyles = {
  // Default ghost button style - Mobile optimized
  ghost: cn(
    "h-7 px-2.5 md:h-6 md:px-2 text-xs",
    "text-gray-400 hover:text-white",
    "border border-white/10 hover:border-white/20",
    "bg-white/5 hover:bg-white/10 backdrop-blur-sm",
    "rounded-lg transition-all duration-200"
  ),
  
  // Primary action button (green) - Mobile optimized
  primary: cn(
    "h-7 px-2.5 md:h-6 md:px-2 text-xs",
    "text-green-400 hover:text-green-300",
    "border border-green-500/20 hover:border-green-400/30",
    "bg-green-500/10 hover:bg-green-500/20 backdrop-blur-sm",
    "rounded-lg transition-all duration-200"
  ),
  
  // Update/Save button (blue) - Mobile optimized
  update: cn(
    "h-7 px-2.5 md:h-6 md:px-2 text-xs",
    "text-blue-400 hover:text-blue-300",
    "border border-blue-500/20 hover:border-blue-400/30",
    "bg-blue-500/10 hover:bg-blue-500/20 backdrop-blur-sm",
    "rounded-lg transition-all duration-200"
  ),
  
  // Danger/Delete button (red) - Mobile optimized
  danger: cn(
    "h-7 px-2.5 md:h-6 md:px-2 text-xs",
    "text-red-400 hover:text-red-300",
    "border border-red-500/20 hover:border-red-400/30",
    "bg-red-500/10 hover:bg-red-500/20 backdrop-blur-sm",
    "rounded-lg transition-all duration-200"
  ),
  
  // Reset button (muted) - Mobile optimized
  reset: cn(
    "h-7 px-2.5 md:h-6 md:px-2 text-xs",
    "text-gray-500 hover:text-gray-400",
    "border border-transparent hover:border-white/10",
    "bg-transparent hover:bg-white/5",
    "rounded-lg transition-all duration-200"
  ),

  // Active state for filter buttons - Mobile optimized
  active: "h-7 px-2.5 md:h-6 md:px-2 text-xs border rounded-lg backdrop-blur-sm",
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
  
  // Inactive state for filter buttons - Mobile optimized
  inactive: cn(
    "border-white/10 text-gray-400 hover:text-white",
    "hover:border-white/20 bg-white/5 hover:bg-white/10"
  )
};

// Search input styles for consistency - Mobile optimized
export const pageHeaderSearchStyles = cn(
  "pl-7 w-32 sm:w-40 md:w-48",
  "bg-white/5 md:bg-[#0d1117] backdrop-blur-sm",
  "border-white/10 md:border-[#21262d]",
  "text-white placeholder-gray-500",
  "focus:border-white/30 md:focus:border-[#58a6ff]",
  "h-7 md:h-6 text-xs rounded-lg",
  "transition-all duration-200"
);
