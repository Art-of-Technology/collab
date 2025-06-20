/**
 * Duration formatting utilities
 */

export interface FormatDurationOptions {
  /**
   * Include seconds in the output
   * @default true
   */
  includeSeconds?: boolean;
  
  /**
   * Show units even when they are zero (e.g., "0h 5m" instead of "5m")
   * @default false
   */
  showZeroUnits?: boolean;
  
  /**
   * Compact format without spaces (e.g., "2h15m30s" instead of "2h 15m 30s")
   * @default false
   */
  compact?: boolean;
  
  /**
   * Maximum precision level: 'hours', 'minutes', or 'seconds'
   * @default 'seconds'
   */
  precision?: 'hours' | 'minutes' | 'seconds';
}

/**
 * Format duration from milliseconds to human-readable string
 * 
 * @param ms - Duration in milliseconds
 * @param options - Formatting options
 * @returns Formatted duration string
 * 
 * @example
 * formatDuration(90061000) // "25h 1m 1s"
 * formatDuration(90061000, { includeSeconds: false }) // "25h 1m"
 * formatDuration(90061000, { compact: true }) // "25h1m1s"
 * formatDuration(90061000, { precision: 'minutes' }) // "25h 1m"
 */
export function formatDuration(ms: number, options: FormatDurationOptions = {}): string {
  const {
    includeSeconds = true,
    showZeroUnits = false,
    compact = false,
    precision = 'seconds'
  } = options;

  // Handle negative values
  if (ms < 0) ms = 0;

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  const separator = compact ? '' : ' ';

  // Add hours if present or if showZeroUnits is true
  if (hours > 0 || (showZeroUnits && (precision === 'hours' || precision === 'minutes' || precision === 'seconds'))) {
    parts.push(`${hours}h`);
  }

  // Add minutes if present, if we have hours, or if showZeroUnits is true
  if (minutes > 0 || hours > 0 || (showZeroUnits && (precision === 'minutes' || precision === 'seconds'))) {
    if (precision !== 'hours') {
      parts.push(`${minutes}m`);
    }
  }

  // Add seconds if enabled and precision allows it
  if (includeSeconds && precision === 'seconds') {
    if (seconds > 0 || hours > 0 || minutes > 0 || showZeroUnits) {
      parts.push(`${seconds}s`);
    }
  }

  // Handle edge cases
  if (parts.length === 0) {
    if (includeSeconds && precision === 'seconds') {
      return '0s';
    } else if (precision === 'minutes' || (precision === 'seconds' && !includeSeconds)) {
      return '0m';
    } else {
      return '0h';
    }
  }

  return parts.join(separator);
}

/**
 * Format duration for UI display (no seconds, clean format)
 * Equivalent to formatDuration(ms, { includeSeconds: false })
 */
export function formatDurationUI(ms: number): string {
  return formatDuration(ms, { includeSeconds: false });
}

/**
 * Format duration for detailed display (with seconds)
 * Equivalent to formatDuration(ms, { includeSeconds: true })
 */
export function formatDurationDetailed(ms: number): string {
  return formatDuration(ms, { includeSeconds: true });
}

/**
 * Format duration for compact display (no spaces)
 * Equivalent to formatDuration(ms, { compact: true })
 */
export function formatDurationCompact(ms: number): string {
  return formatDuration(ms, { compact: true });
}

/**
 * Parse duration string back to milliseconds
 * Supports formats like "2h 15m 30s", "15m", "30s", etc.
 */
export function parseDurationToMs(duration: string): number {
  if (!duration || typeof duration !== 'string') return 0;

  const hoursMatch = duration.match(/(\d+)h/);
  const minutesMatch = duration.match(/(\d+)m/);
  const secondsMatch = duration.match(/(\d+)s/);

  const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1], 10) : 0;
  const seconds = secondsMatch ? parseInt(secondsMatch[1], 10) : 0;

  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

/**
 * Get duration breakdown as individual components
 */
export function getDurationComponents(ms: number): {
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
  totalMinutes: number;
  totalHours: number;
} {
  if (ms < 0) ms = 0;

  const totalSeconds = Math.floor(ms / 1000);
  const totalMinutes = Math.floor(ms / (1000 * 60));
  const totalHours = Math.floor(ms / (1000 * 60 * 60));

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    hours,
    minutes,
    seconds,
    totalSeconds,
    totalMinutes,
    totalHours,
  };
} 