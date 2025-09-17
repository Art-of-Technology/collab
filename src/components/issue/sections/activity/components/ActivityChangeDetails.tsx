"use client";

import { ArrowRight } from 'lucide-react';
import { ActivityChangeDetailsProps } from '../types/activity';
import { formatValue } from '../utils/activityHelpers';
import { TextDiff } from './TextDiff';

export function ActivityChangeDetails({ activity }: ActivityChangeDetailsProps) {
  const { action, details, oldValue, newValue } = activity;

  // Special handling for assignment activities
  if ((action === 'ASSIGNED' || action === 'UNASSIGNED') && details) {
    return (
      <div className="mt-1 text-[10px] text-[#666] flex items-center gap-1.5">
        <span className="text-[#ef4444]">{details.oldAssignee?.name || 'Unassigned'}</span>
        <ArrowRight className="h-2.5 w-2.5" />
        <span className="text-[#22c55e]">{details.newAssignee?.name || 'Unassigned'}</span>
      </div>
    );
  }

  // Special handling for reporter changes
  if (action === 'REPORTER_CHANGED' && details) {
    return (
      <div className="mt-1 text-[10px] text-[#666] flex items-center gap-1.5">
        <span className="text-[#ef4444]">{details.oldReporter?.name || 'None'}</span>
        <ArrowRight className="h-2.5 w-2.5" />
        <span className="text-[#22c55e]">{details.newReporter?.name || 'None'}</span>
      </div>
    );
  }

  // Special handling for column/movement changes
  if (action === 'MOVED' && details?.fromColumn && details?.toColumn) {
    return (
      <div className="mt-1 text-[10px] text-[#666] flex items-center gap-1.5">
        <span className="text-[#ef4444]">{details.fromColumn.name}</span>
        <ArrowRight className="h-2.5 w-2.5" />
        <span className="text-[#22c55e]">{details.toColumn.name}</span>
      </div>
    );
  }

  if (action === 'COLUMN_CHANGED' && details?.fromColumn && details?.toColumn) {
    return (
      <div className="mt-1 text-[10px] text-[#666] flex items-center gap-1.5">
        <span className="text-[#ef4444]">{details.fromColumn.name}</span>
        <ArrowRight className="h-2.5 w-2.5" />
        <span className="text-[#22c55e]">{details.toColumn.name}</span>
      </div>
    );
  }

  // Special handling for time adjustments
  if (action === 'TIME_ADJUSTED' && details) {
    return (
      <div className="mt-1 text-[10px] text-[#666]">
        <div className="flex items-center gap-1.5">
          <span className="text-[#ef4444]">{details.originalFormatted || details.original}</span>
          <ArrowRight className="h-2.5 w-2.5" />
          <span className="text-[#22c55e]">{details.newFormatted || details.new}</span>
        </div>
        {details.reason && (
          <div className="mt-0.5 text-[#888] italic">"{details.reason}"</div>
        )}
      </div>
    );
  }

  // Special handling for session edits
  if (action === 'SESSION_EDITED' && details?.oldValue && details?.newValue) {
    try {
      const oldData = JSON.parse(details.oldValue);
      const newData = JSON.parse(details.newValue);
      const changes = details.changes;
      
      return (
        <div className="mt-1 text-[10px] text-[#666]">
          <div className="flex items-center gap-1.5">
            <span className="text-[#ef4444]">{oldData.duration}</span>
            <ArrowRight className="h-2.5 w-2.5" />
            <span className="text-[#22c55e]">{newData.duration}</span>
            {changes?.durationChange && (
              <span className="text-[#888]">({changes.durationChange.formatted})</span>
            )}
          </div>
          {details.reason && (
            <div className="mt-0.5 text-[#888] italic">"{details.reason}"</div>
          )}
        </div>
      );
    } catch {
      return null;
    }
  }

  // Special handling for description changes with diff view
  if (action === 'DESCRIPTION_UPDATED' && oldValue !== undefined && newValue !== undefined) {
    try {
      const oldText = typeof oldValue === 'string' ? oldValue : JSON.stringify(oldValue);
      const newText = typeof newValue === 'string' ? newValue : JSON.stringify(newValue);
      
      // Only show diff if texts are meaningfully different
      if (oldText.trim() !== newText.trim()) {
        return <TextDiff oldText={oldText} newText={newText} />;
      }
    } catch (error) {
      console.warn('Error parsing description values for diff:', error);
      // Fall back to generic display
    }
  }

  // Special handling for title changes with compact diff view
  if (action === 'TITLE_UPDATED' && oldValue !== undefined && newValue !== undefined) {
    try {
      const oldText = typeof oldValue === 'string' ? oldValue : JSON.stringify(oldValue);
      const newText = typeof newValue === 'string' ? newValue : JSON.stringify(newValue);
      
      // For titles, show a more compact view
      if (oldText.trim() !== newText.trim()) {
        return <TextDiff oldText={oldText} newText={newText} maxHeight={120} />;
      }
    } catch (error) {
      console.warn('Error parsing title values for diff:', error);
      // Fall back to generic display
    }
  }

  // Generic handling for other changes
  if (oldValue !== undefined || newValue !== undefined) {
    return (
      <div className="mt-1 text-[10px] text-[#666] flex items-center gap-1.5">
        {oldValue !== undefined && (
          <span className="text-[#ef4444]">
            {action === 'COLUMN_CHANGED' && details?.fromColumn?.name 
              ? details.fromColumn.name 
              : formatValue(oldValue, activity)}
          </span>
        )}
        {oldValue !== undefined && newValue !== undefined && (
          <ArrowRight className="h-2.5 w-2.5" />
        )}
        {newValue !== undefined && (
          <span className="text-[#22c55e]">
            {action === 'COLUMN_CHANGED' && details?.toColumn?.name 
              ? details.toColumn.name 
              : formatValue(newValue, activity)}
          </span>
        )}
      </div>
    );
  }

  return null;
}
