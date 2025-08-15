import React, { useState } from 'react';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { 
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Loader2, ChevronDown, Circle } from "lucide-react";
import { useBoardColumns } from "@/hooks/queries/useTask";
import { Badge } from "@/components/ui/badge";

interface StatusSelectProps {
  value: string | null | undefined;
  onValueChange: (status: string, columnId?: string) => void;
  boardId: string | null | undefined;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  variant?: 'simple' | 'searchable';
}

export function StatusSelect({
  value,
  onValueChange,
  boardId,
  disabled = false,
  placeholder = "Select status",
  className = '',
  variant = 'simple'
}: StatusSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Fetch columns based on boardId
  const { 
    data: columns = [], 
    isLoading: columnsLoading 
  } = useBoardColumns(boardId);

  // Handle status change
  const handleStatusSelect = (status: string) => {
    const column = columns.find(col => col.name === status);
    onValueChange(status, column?.id);
    setOpen(false);
    setSearchQuery("");
  };

  // Filter columns based on search query
  const filteredColumns = columns.filter(column => 
    !searchQuery || 
    (column.name?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Find the selected column
  const selectedColumn = value ? columns.find(col => col.name === value) : null;

  // Combine external disabled state with internal loading state
  // Only disable if there's no data AND it's loading, or if there's no boardId
  const isDisabled = disabled || !boardId || (columnsLoading && columns.length === 0);

  // Simple dropdown variant
  if (variant === 'simple') {
    return (
      <Select
        value={value || undefined}
        onValueChange={(status) => {
          const column = columns.find(col => col.name === status);
          onValueChange(status, column?.id);
        }}
        disabled={isDisabled}
      >
        <SelectTrigger className={`w-full ${className}`}>
          <SelectValue placeholder={!boardId ? "Select board first" : placeholder}>
            {selectedColumn && getStatusBadge(selectedColumn.name)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {columnsLoading && (
            <SelectItem value="loading" disabled>
              <div className="flex items-center">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading...
              </div>
            </SelectItem>
          )}
          {!columnsLoading && columns.length === 0 && boardId && (
            <SelectItem value="no-columns" disabled>
              No statuses found
            </SelectItem>
          )}
          {!columnsLoading && !boardId && (
            <SelectItem value="no-board" disabled>
              Select board first
            </SelectItem>
          )}
          {columns.map((column) => (
            <SelectItem key={column.id} value={column.name}>
              {getStatusBadge(column.name)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // Searchable popover variant
  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen} modal={true}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="flex justify-between w-full min-w-0 px-2"
            disabled={isDisabled}
          >
            {columnsLoading ? (
              <div className="flex items-center">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                <span>Loading statuses...</span>
              </div>
            ) : selectedColumn ? (
              getStatusBadge(selectedColumn.name)
            ) : (
              <span className="text-muted-foreground">
                {!boardId ? "Select board first" : placeholder}
              </span>
            )}
            {!columnsLoading && <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0 border-none bg-transparent shadow-none" align="start" sideOffset={4} forceMount>
          <Command className="rounded-md border shadow-md">
            <CommandInput 
              placeholder="Search statuses..." 
              value={searchQuery}
              onValueChange={setSearchQuery}
              className="h-9"
            />
            <CommandList className="max-h-[200px] overflow-y-auto">
              <CommandEmpty>No status found.</CommandEmpty>
              <CommandGroup heading="Statuses">
                {filteredColumns.map((column) => (
                  <CommandItem
                    key={column.id}
                    value={column.name}
                    onSelect={() => handleStatusSelect(column.name)}
                    className="cursor-pointer"
                  >
                    {getStatusBadge(column.name)}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
} 

export const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      'TO DO': 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
      'TODO': 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
      'BACKLOG': 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
      'IN PROGRESS': 'bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-100',
      'IN_PROGRESS': 'bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-100',
      'REVIEW': 'bg-purple-200 text-purple-800 dark:bg-purple-800 dark:text-purple-100',
      'IN REVIEW': 'bg-purple-200 text-purple-800 dark:bg-purple-800 dark:text-purple-100',
      'DONE': 'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-100',
      'COMPLETED': 'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-100',
      'PLANNED': 'bg-indigo-200 text-indigo-800 dark:bg-indigo-800 dark:text-indigo-100',
      'CANCELLED': 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-100',
      'CANCELED': 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-100',
    };

    const normalizedStatus = (status || '').toUpperCase().replace(/\s+/g, ' ').trim();
    const color = statusColors[normalizedStatus] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';

    return (
      <Badge className={`${color} px-2 py-1 flex items-center gap-1`}>
        <Circle className="h-2 w-2 fill-current" />
        <span>{status}</span>
      </Badge>
    );
  };