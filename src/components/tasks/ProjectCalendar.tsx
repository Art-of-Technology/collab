"use client";

import React, { useState } from "react";
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay } from "date-fns";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface CalendarItem {
  id: string;
  title: string;
  date: Date;
  type: 'milestone' | 'epic' | 'story';
  status: string;
  color?: string;
}

interface ProjectCalendarProps {
  milestones: any[];
  epics: any[];
  stories: any[];
  onCreateMilestone: () => void;
  onCreateEpic: () => void;
  onCreateStory: () => void;
}

export function ProjectCalendar({
  milestones,
  epics,
  stories,
  onCreateMilestone,
  onCreateEpic,
  onCreateStory,
}: ProjectCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  
  // Format calendar items from the data
  const calendarItems = React.useMemo(() => {
    const items: CalendarItem[] = [];
    
    // Process milestones
    milestones.forEach(milestone => {
      if (milestone.startDate) {
        items.push({
          id: `milestone-start-${milestone.id}`,
          title: `${milestone.title} (Start)`,
          date: new Date(milestone.startDate),
          type: 'milestone',
          status: milestone.status,
          color: milestone.color || '#6366F1'
        });
      }
      
      if (milestone.dueDate) {
        items.push({
          id: `milestone-due-${milestone.id}`,
          title: `${milestone.title} (Due)`,
          date: new Date(milestone.dueDate),
          type: 'milestone',
          status: milestone.status,
          color: milestone.color || '#6366F1'
        });
      }
    });
    
    // Process epics
    epics.forEach(epic => {
      if (epic.startDate) {
        items.push({
          id: `epic-start-${epic.id}`,
          title: `${epic.title} (Start)`,
          date: new Date(epic.startDate),
          type: 'epic',
          status: epic.status,
          color: epic.color || '#8B5CF6'
        });
      }
      
      if (epic.dueDate) {
        items.push({
          id: `epic-due-${epic.id}`,
          title: `${epic.title} (Due)`,
          date: new Date(epic.dueDate),
          type: 'epic',
          status: epic.status,
          color: epic.color || '#8B5CF6'
        });
      }
    });
    
    // Process stories
    stories.forEach(story => {
      if (story.dueDate) {
        items.push({
          id: `story-due-${story.id}`,
          title: story.title,
          date: new Date(story.dueDate),
          type: 'story',
          status: story.status,
          color: '#3B82F6'
        });
      }
    });
    
    return items;
  }, [milestones, epics, stories]);
  
  // Generate calendar days
  const calendarDays = React.useMemo(() => {
    const firstDay = startOfMonth(currentMonth);
    const lastDay = endOfMonth(currentMonth);
    return eachDayOfInterval({ start: firstDay, end: lastDay });
  }, [currentMonth]);
  
  // Navigate between months
  const previousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };
  
  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };
  
  // Get items for a specific day
  const getDayItems = (day: Date) => {
    return calendarItems.filter(item => isSameDay(item.date, day));
  };
  
  // Get type badge color
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'milestone':
        return 'bg-indigo-500';
      case 'epic':
        return 'bg-purple-500';
      case 'story':
        return 'bg-blue-500';
      default:
        return 'bg-gray-500';
    }
  };
  
  // Get status color
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'done':
        return 'bg-green-500';
      case 'in-progress':
      case 'in progress':
        return 'bg-blue-500';
      case 'planned':
      case 'backlog':
        return 'bg-gray-500';
      default:
        return 'bg-gray-500';
    }
  };
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-medium flex items-center gap-2">Project Calendar <small className="text-xs text-muted-foreground">({format(currentMonth, 'MMMM yyyy')})</small></h2>
          <p className="text-sm text-gray-500">
            Manage your project&apos;s milestones, epics, and stories
          </p>
        </div>
        
        <div className="flex space-x-2">
          <Button variant="outline" size="sm" onClick={previousMonth}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setCurrentMonth(new Date())}
          >
            <CalendarIcon className="h-4 w-4 mr-1" />
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={nextMonth}>
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
      
      <div className="border rounded-md bg-card overflow-hidden">
        {/* Calendar header */}
        <div className="grid grid-cols-7 bg-muted">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="p-2 text-sm font-medium text-center">
              {day}
            </div>
          ))}
        </div>
        
        {/* Calendar grid */}
        <div className="grid grid-cols-7 auto-rows-fr">
          {Array.from({ length: new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay() }).map((_, i) => (
            <div key={`empty-start-${i}`} className="p-2 border-t border-r h-32 bg-muted/20" />
          ))}
          
          {calendarDays.map((day, dayIndex) => {
            const dayItems = getDayItems(day);
            const isToday = isSameDay(day, new Date());
            
            return (
              <div 
                key={day.toString()} 
                className={cn(
                  "p-2 border-t border-r min-h-[8rem] relative",
                  !isSameMonth(day, currentMonth) && "bg-muted/20",
                  isToday && "bg-primary/5"
                )}
              >
                <div className={cn(
                  "flex justify-between items-center mb-1",
                  isToday && "font-bold text-primary"
                )}>
                  <span className="text-sm">{format(day, 'd')}</span>
                  {dayItems.length > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {dayItems.length}
                    </Badge>
                  )}
                </div>
                
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {dayItems.length === 0 ? (
                    <div 
                      className="flex items-center justify-center h-16 text-xs text-muted-foreground"
                    >
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 text-xs"
                        onClick={() => {
                          // Set date to this day in createMilestone dialog
                          onCreateMilestone();
                        }}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                      </Button>
                    </div>
                  ) : (
                    <TooltipProvider>
                      {dayItems.map((item, i) => (
                        <Tooltip key={item.id}>
                          <TooltipTrigger asChild>
                            <div 
                              className={cn(
                                "text-xs px-1.5 py-0.5 rounded truncate flex items-center",
                                item.type === 'milestone' ? "bg-indigo-100 dark:bg-indigo-900/30" : 
                                item.type === 'epic' ? "bg-purple-100 dark:bg-purple-900/30" : 
                                "bg-blue-100 dark:bg-blue-900/30",
                                "cursor-pointer hover:opacity-80"
                              )}
                            >
                              <div className={cn(
                                "w-1.5 h-1.5 rounded-full mr-1",
                                getTypeColor(item.type)
                              )} />
                              <span className="truncate">{item.title}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="space-y-1">
                              <p className="font-medium">{item.title}</p>
                              <div className="flex gap-2">
                                <Badge className={getTypeColor(item.type)}>
                                  {item.type}
                                </Badge>
                                <Badge className={getStatusColor(item.status)}>
                                  {item.status}
                                </Badge>
                              </div>
                              <p className="text-xs">Date: {format(item.date, 'PP')}</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </TooltipProvider>
                  )}
                </div>
              </div>
            );
          })}
          
          {Array.from({ length: 6 - Math.ceil((calendarDays.length + new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay()) / 7) }).map((_, i) => (
            <div key={`empty-end-${i}`} className="p-2 border-t border-r h-32 bg-muted/20" />
          ))}
        </div>
      </div>
      
      <div className="mt-4 p-4 border rounded-md bg-card">
        <h3 className="text-sm font-medium mb-2">Legend</h3>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-indigo-500 mr-1" />
            <span className="text-xs">Milestone</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-purple-500 mr-1" />
            <span className="text-xs">Epic</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-blue-500 mr-1" />
            <span className="text-xs">Story</span>
          </div>
          <div className="ml-4 flex items-center">
            <div className="w-3 h-3 rounded-full bg-green-500 mr-1" />
            <span className="text-xs">Completed</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-blue-500 mr-1" />
            <span className="text-xs">In Progress</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-gray-500 mr-1" />
            <span className="text-xs">Planned</span>
          </div>
        </div>
      </div>
    </div>
  );
} 