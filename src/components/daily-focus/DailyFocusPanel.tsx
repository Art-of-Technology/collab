"use client";

import { useDailyFocusEntry } from '@/hooks/queries/useDailyFocus';
import { Button } from '@/components/ui/button';
import { Calendar, ArrowRight } from 'lucide-react';
import { formatDate, isToday } from '@/utils/dailyFocusHelpers';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface DailyFocusPanelProps {
  workspaceId: string;
  workspaceSlug?: string;
  userId?: string;
}

export function DailyFocusPanel({
  workspaceId,
  workspaceSlug,
  userId,
}: DailyFocusPanelProps) {
  const params = useParams();
  const today = new Date();
  const { data: entryData, isLoading } = useDailyFocusEntry(
    workspaceId,
    today,
    userId
  );

  const entry = entryData?.entry;
  const completedCount = entry?.reflections?.filter((r) => r.status === 'COMPLETED').length || 0;
  const plannedCount = entry?.plans?.length || 0;
  
  // Use workspaceSlug prop, or fallback to params, or workspaceId
  const workspacePath = workspaceSlug || (params?.workspaceId as string) || workspaceId;

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-400" />
          <h3 className="text-white text-sm font-medium">Daily Focus</h3>
        </div>
        <Link href={`/${workspacePath}/views?type=PLANNING`}>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
            View Full
            <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="text-gray-400 text-xs">Loading...</div>
      ) : entry ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Status:</span>
            <span className={entry.status === 'SUBMITTED' ? 'text-green-400' : 'text-yellow-400'}>
              {entry.status === 'SUBMITTED' ? 'Submitted' : 'Draft'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Completed:</span>
            <span className="text-white">{completedCount}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Planned:</span>
            <span className="text-white">{plannedCount}</span>
          </div>
        </div>
      ) : (
        <div className="text-gray-400 text-xs">
          No entry for today. Create one to start planning.
        </div>
      )}
    </div>
  );
}

