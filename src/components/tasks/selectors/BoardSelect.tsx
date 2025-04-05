import React, { useState, useEffect } from 'react';
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
import { Loader2, ChevronDown, Layout } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useWorkspaceBoards, useBoardColumns } from "@/hooks/queries/useTask";

interface Board {
  id: string;
  name: string;
  description?: string;
}

interface Column {
  id: string;
  name: string;
}

interface BoardSelectProps {
  boardValue: string;
  onBoardChange: (boardId: string) => void;
  columnValue?: string | null;
  onColumnChange?: (columnId: string) => void;
  disabled?: boolean;
  showColumns?: boolean;
  workspaceId?: string;
  className?: string;
}

export function BoardSelect({
  boardValue,
  onBoardChange,
  columnValue,
  onColumnChange,
  disabled = false,
  showColumns = true,
  workspaceId,
  className = ''
}: BoardSelectProps) {
  const { currentWorkspace } = useWorkspace();
  const wsId = workspaceId || currentWorkspace?.id;
  
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Use TanStack Query hooks
  const { 
    data: boards = [], 
    isLoading: boardsLoading 
  } = useWorkspaceBoards(wsId);
  
  const { 
    data: columns = [], 
    isLoading: columnsLoading 
  } = useBoardColumns(boardValue);
  
  // Set default board if none selected and boards are available
  useEffect(() => {
    if (boards.length > 0 && !boardValue) {
      onBoardChange(boards[0].id);
    }
  }, [boards, boardValue, onBoardChange]);
  
  // Set default column if none selected and columns are available
  useEffect(() => {
    if (columns.length > 0 && onColumnChange && !columnValue) {
      onColumnChange(columns[0].id);
    }
  }, [columns, columnValue, onColumnChange]);

  // Handle board change
  const handleBoardSelect = (boardId: string) => {
    onBoardChange(boardId);
    setOpen(false);
    setSearchQuery("");
    
    // Reset column when board changes
    if (showColumns && onColumnChange) {
      onColumnChange(null as any);
    }
  };

  // Filter boards based on search query
  const filteredBoards = boards.filter(board => 
    !searchQuery || 
    (board.name?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Find the selected board
  const selectedBoard = boardValue ? boards.find(b => b.id === boardValue) : null;
  
  // Determine if we're in a loading state
  const isLoading = boardsLoading || (showColumns && columnsLoading && boardValue);

  if (isLoading && !boards.length) {
    return (
      <div className="flex items-center h-10 px-3 text-sm border rounded-md">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        Loading...
      </div>
    );
  }

  return (
    <div className={`${className} ${showColumns ? 'space-y-4' : ''}`}>
      <Popover open={open} onOpenChange={setOpen} modal={true}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="flex justify-between w-full"
            disabled={disabled}
          >
            {selectedBoard ? (
              <div className="flex items-center gap-2">
                <Layout className="h-4 w-4 text-muted-foreground" />
                <span>{selectedBoard.name}</span>
              </div>
            ) : (
              <span className="text-muted-foreground">Select board</span>
            )}
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0 border-none bg-transparent shadow-none" align="start" sideOffset={4} forceMount>
          <Command className="rounded-md border shadow-md">
            <CommandInput 
              placeholder="Search boards..." 
              value={searchQuery}
              onValueChange={setSearchQuery}
              className="h-9"
            />
            <CommandList className="max-h-[200px] overflow-y-auto">
              <CommandEmpty>No board found.</CommandEmpty>
              <CommandGroup heading="Boards">
                {filteredBoards.map((board) => (
                  <CommandItem
                    key={board.id}
                    value={board.name}
                    onSelect={() => handleBoardSelect(board.id)}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Layout className="h-4 w-4 text-muted-foreground" />
                      <span>{board.name}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {showColumns && onColumnChange && (
        <Select
          value={columnValue || undefined}
          onValueChange={onColumnChange}
          disabled={disabled || columnsLoading || columns.length === 0}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select column" />
          </SelectTrigger>
          <SelectContent>
            {columns.map((column) => (
              <SelectItem key={column.id} value={column.id}>
                {column.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}