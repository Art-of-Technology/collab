"use client";

import { useState, useMemo, useEffect } from 'react';
import { SplitUserCard } from '@/components/daily-focus/SplitUserCard';
import { PersonalPlanView } from '@/components/daily-focus/PersonalPlanView';
import { useTeamSync } from '@/hooks/queries/useTeamSync';
import { useSession } from 'next-auth/react';
import { Loader2, Calendar as CalendarIcon, Users, User, Save, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { ViewProjectSelector } from '@/components/views/selectors/ViewProjectSelector';
import { AssigneeSelector } from '@/components/views/selectors/AssigneeSelector';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

interface PlanningViewRendererProps {
  view: any;
  issues: any[];
  workspace: any;
  currentUser: any;
}

export default function PlanningViewRenderer({
  view,
  issues,
  workspace,
  currentUser,
}: PlanningViewRendererProps) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'team' | 'personal'>('team');
  
  // Get workspace projects for filter
  const workspaceProjects = useMemo(() => {
    // Extract unique projects from view or workspace
    const projectSet = new Map();
    issues.forEach(issue => {
      if (issue.project && !projectSet.has(issue.project.id)) {
        projectSet.set(issue.project.id, {
          id: issue.project.id,
          name: issue.project.name,
          color: issue.project.color,
        });
      }
    });
    return Array.from(projectSet.values());
  }, [issues]);

  // Filter states - Initialize from view filters
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>(
    view.projects?.map((p: any) => p.id) || []
  );
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(
    view.filters?.assignee || []
  );

  // Initialize with all projects when workspaceProjects changes (only if not set by view)
  useEffect(() => {
    if (workspaceProjects.length > 0 && selectedProjectIds.length === 0) {
      setSelectedProjectIds(workspaceProjects.map(p => p.id));
    }
  }, [workspaceProjects, selectedProjectIds.length]);

  // Track if filters have changed from saved view
  const hasChanges = useMemo(() => {
    const savedProjectIds = view.projects?.map((p: any) => p.id) || [];
    const savedAssigneeIds = view.filters?.assignee || [];
    
    return (
      JSON.stringify(selectedProjectIds.sort()) !== JSON.stringify(savedProjectIds.sort()) ||
      JSON.stringify(selectedUserIds.sort()) !== JSON.stringify(savedAssigneeIds.sort())
    );
  }, [selectedProjectIds, selectedUserIds, view.projects, view.filters]);

  // Get workspace members for filter
  const workspaceMembers = useMemo(() => {
    const memberSet = new Map();
    issues.forEach(issue => {
      if (issue.assignee && !memberSet.has(issue.assignee.id)) {
        memberSet.set(issue.assignee.id, {
          id: issue.assignee.id,
          name: issue.assignee.name,
          image: issue.assignee.image,
        });
      }
    });
    return Array.from(memberSet.values());
  }, [issues]);

  // Calculate yesterday date for display
  const yesterdayDate = useMemo(() => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() - 1);
    date.setHours(0, 0, 0, 0);
    return date;
  }, [selectedDate]);

  // Fetch team sync data for the selected date (includes yesterday + today)
  const { data: teamSyncData, isLoading } = useTeamSync({
    workspaceId: workspace.id,
    date: selectedDate,
    projectIds: selectedProjectIds.length > 0 ? selectedProjectIds : undefined,
    userIds: selectedUserIds.length > 0 ? selectedUserIds : undefined,
  });

  const teamSync = teamSyncData?.teamSync || [];

  // Find current user's sync data for personal view
  const currentUserSync = useMemo(() => {
    return teamSync.find(sync => sync.userId === currentUser.id);
  }, [teamSync, currentUser.id]);

  const handleSaveAnnotations = async (annotations: any) => {
    // TODO: Save annotations to backend
    console.log('Saving annotations:', annotations);
  };

  // Save view filter changes
  const handleSaveChanges = async () => {
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/views/${view.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectIds: selectedProjectIds,
          filters: {
            ...view.filters,
            assignee: selectedUserIds,
          },
        })
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'View filters saved successfully'
        });

        // Invalidate and refetch views to get updated data
        queryClient.invalidateQueries({ queryKey: ['views', workspace.id] });
        router.refresh();
      } else {
        throw new Error('Failed to save changes');
      }
    } catch (error) {
      console.error('Error saving view:', error);
      toast({
        title: 'Error',
        description: 'Failed to save view filters',
        variant: 'destructive'
      });
    }
  };

  // Reset filters to saved view state
  const handleResetChanges = () => {
    setSelectedProjectIds(view.projects?.map((p: any) => p.id) || []);
    setSelectedUserIds(view.filters?.assignee || []);
  };

  const [dateOpen, setDateOpen] = useState(false);

  // Date navigation handlers
  const goToPreviousDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    setSelectedDate(newDate);
  };

  const goToNextDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    setSelectedDate(newDate);
  };

  const goToToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setSelectedDate(today);
  };

  const isToday = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return selectedDate.getTime() === today.getTime();
  }, [selectedDate]);

  return (
    <div className="h-full flex flex-col bg-[#101011]">
      {/* Filter Bar - Matching Kanban Design */}
      <div className={cn(
        "border-b bg-[#101011] transition-colors",
        "border-white/10 bg-black/60 backdrop-blur-xl px-4 py-3",
        "md:border-[#1a1a1a] md:bg-[#101011] md:backdrop-blur-none md:px-6 md:py-2"
      )}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-2">
          {/* View Mode Toggle Buttons */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 md:mr-4">
            <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode('team')}
              className={cn(
                "h-7 px-3 text-xs border whitespace-nowrap shrink-0",
                "md:h-6 md:px-2",
                viewMode === 'team'
                  ? 'border-blue-400 text-blue-400 bg-blue-500/20 hover:bg-blue-500/30 hover:border-blue-400'
                  : 'border-white/20 text-gray-400 hover:text-white hover:border-white/30 bg-white/5 hover:bg-white/10'
              )}
            >
              <Users className="h-3 w-3 mr-1.5" />
              Team View
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode('personal')}
              className={cn(
                "h-7 px-3 text-xs border whitespace-nowrap shrink-0",
                "md:h-6 md:px-2",
                viewMode === 'personal'
                  ? 'border-green-400 text-green-400 bg-green-500/20 hover:bg-green-500/30 hover:border-green-400'
                  : 'border-white/20 text-gray-400 hover:text-white hover:border-white/30 bg-white/5 hover:bg-white/10'
              )}
            >
              <User className="h-3 w-3 mr-1.5" />
              My Plan
            </Button>
            </div>

            {/* Save/Reset buttons */}
            {hasChanges && !view.isDefault && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetChanges}
                  className="h-7 px-2 text-xs text-gray-400 hover:text-white"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Reset
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveChanges}
                  className="h-7 px-2 text-xs bg-blue-600 hover:bg-blue-700"
                >
                  <Save className="h-3 w-3 mr-1" />
                  Save changes
                </Button>
              </div>
            )}
          </div>

          {/* Mobile: Filters in Column */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-2 md:flex-1">
            {/* Badge-like selectors */}
            <div className="flex flex-wrap gap-3 md:gap-4">
              <div className="flex flex-wrap gap-1.5 md:gap-1">
                {/* Date Navigation */}
                <div className="inline-flex items-center gap-0.5 bg-[#181818] border border-[#2d2d30] rounded">
                  <button
                    type="button"
                    onClick={goToPreviousDay}
                    className="inline-flex items-center justify-center h-5 w-5 hover:bg-[#1a1a1a] transition-colors rounded-l"
                    title="Previous day"
                  >
                    <ChevronLeft className="h-3 w-3 text-[#cccccc]" />
                  </button>
                  
                  <Popover open={dateOpen} onOpenChange={setDateOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 text-xs transition-colors h-5 leading-tight",
                          "text-[#cccccc] hover:bg-[#1a1a1a] focus:outline-none"
                        )}
                      >
                        <CalendarIcon className="h-3 w-3 text-[#6366f1]" />
                        <span className="text-[#cccccc] text-xs font-medium">
                          {format(selectedDate, "MMM d, yyyy")}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-[#1c1c1e] border-[#333]" align="start">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(date) => {
                          if (date) {
                            setSelectedDate(date);
                            setDateOpen(false);
                          }
                        }}
                        initialFocus
                        className="bg-[#1c1c1e] text-white"
                      />
                      <div className="p-2 border-t border-[#2d2d30] flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            goToToday();
                            setDateOpen(false);
                          }}
                          className="flex-1 h-7 text-xs"
                        >
                          Today
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>

                  <button
                    type="button"
                    onClick={goToNextDay}
                    className="inline-flex items-center justify-center h-5 w-5 hover:bg-[#1a1a1a] transition-colors rounded-r"
                    title="Next day"
                  >
                    <ChevronRight className="h-3 w-3 text-[#cccccc]" />
                  </button>
                </div>

                {/* Quick Today Button */}
                {!isToday && (
                  <button
                    type="button"
                    onClick={goToToday}
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors h-5 leading-tight",
                      "border border-blue-500/50 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400"
                    )}
                  >
                    Today
                  </button>
                )}

                {/* Project Selector */}
                <ViewProjectSelector
                  value={selectedProjectIds}
                  onChange={setSelectedProjectIds}
                  projects={workspaceProjects}
                />

                {/* Team Member Selector */}
                <AssigneeSelector
                  value={selectedUserIds}
                  onChange={setSelectedUserIds}
                  assignees={workspaceMembers}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Single Scroll with Split User Cards */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex flex-col">
          {viewMode === 'team' ? (
            <>
              {/* Yesterday | Today Header */}
              <div className="px-6 py-4 border-b border-[#1a1a1a] bg-[#0a0a0a]">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">📅</span>
                    <div>
                      <div className="text-sm font-semibold text-white">Yesterday</div>
                      <div className="text-xs text-gray-500">
                        {format(yesterdayDate, "MMM d, yyyy")}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🎯</span>
                    <div>
                      <div className="text-sm font-semibold text-white flex items-center gap-2">
                        Today
                        {isToday && (
                          <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full border border-green-500/30 font-normal">
                            Live
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {format(selectedDate, "MMM d, yyyy")}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Scrollable User Cards */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {teamSync.length > 0 ? (
                  teamSync.map((member) => (
                    <SplitUserCard
                      key={member.userId}
                      member={member}
                      workspaceSlug={workspace.slug}
                      editable={true}
                      onSaveAnnotations={handleSaveAnnotations}
                    />
                  ))
                ) : (
                  <div className="text-center py-16 text-gray-500">
                    <div className="text-4xl mb-3">👥</div>
                    <div className="text-sm">No team activity found</div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="h-full overflow-y-auto p-6">
              {currentUserSync ? (
                <PersonalPlanView
                  userSync={currentUserSync}
                  workspaceSlug={workspace.slug}
                  date={selectedDate}
                />
              ) : (
                <div className="text-center py-16 text-gray-500">
                  <div className="text-4xl mb-3">👤</div>
                  <div className="text-sm">No activity found for your account</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

