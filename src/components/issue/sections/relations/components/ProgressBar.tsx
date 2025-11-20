"use client";

import { cn } from "@/lib/utils";
import { getProgressBarColor } from "../utils/progressHelpers";

interface ProgressBarProps {
  percentage: number;
  showLabel?: boolean;
  compact?: boolean;
  className?: string;
}

export function ProgressBar({
  percentage,
  showLabel = false,
  compact = false,
  className,
}: ProgressBarProps) {
  const colors = getProgressBarColor(percentage);
  const height = compact ? "h-1" : "h-2";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn("flex-1 rounded-full overflow-hidden", colors.bg, height)}>
        <div
          className={cn("h-full rounded-full transition-all duration-300", colors.bar)}
          style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-[#7d8590] font-medium min-w-[3ch]">
          {percentage}%
        </span>
      )}
    </div>
  );
}

interface ProgressBarWithLabelProps {
  completed: number;
  total: number;
  className?: string;
}

export function ProgressBarWithLabel({
  completed,
  total,
  className,
}: ProgressBarWithLabelProps) {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const colors = getProgressBarColor(percentage);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex items-center gap-1.5 min-w-[4rem]">
        <span className="text-xs text-[#e1e7ef] font-medium">{completed}</span>
        <span className="text-xs text-[#7d8590]">/</span>
        <span className="text-xs text-[#7d8590]">{total}</span>
      </div>
      <div className={cn("flex-1 h-1.5 rounded-full overflow-hidden", colors.bg)}>
        <div
          className={cn("h-full rounded-full transition-all duration-300", colors.bar)}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-[#7d8590] font-medium min-w-[3ch]">
        {percentage}%
      </span>
    </div>
  );
}

interface CircularProgressProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function CircularProgress({
  percentage,
  size = 24,
  strokeWidth = 2,
  className,
}: CircularProgressProps) {
  const colors = getProgressBarColor(percentage);
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  // Extract color value from Tailwind class
  const getColorValue = (colorClass: string) => {
    if (colorClass.includes('green')) return '#22c55e';
    if (colorClass.includes('blue')) return '#3b82f6';
    if (colorClass.includes('yellow')) return '#eab308';
    if (colorClass.includes('red')) return '#ef4444';
    return '#666';
  };

  const strokeColor = getColorValue(colors.bar);
  const bgColor = '#2d2d30';

  return (
    <svg
      className={cn("transform -rotate-90", className)}
      width={size}
      height={size}
    >
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={bgColor}
        strokeWidth={strokeWidth}
        fill="none"
      />
      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-300"
      />
    </svg>
  );
}

