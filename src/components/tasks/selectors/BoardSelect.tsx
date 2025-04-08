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
  
  // Fetch boards using the hook (it internally handles enabling based on wsId)
  const { 
    data: boards = [], 
    isLoading: boardsLoading 
  } = useWorkspaceBoards(wsId);
  
  // Fetch columns based on boardValue
  const { 
    data: columns = [], 
    isLoading: columnsLoading 
  } = useBoardColumns(boardValue);
  
  // useEffect for default column remains (depends on boardValue)
  useEffect(() => {
    if (columns.length > 0 && onColumnChange && !columnValue) {
      // Check if boardValue is valid before setting default column
      if (boardValue && boards.some(b => b.id === boardValue)) {
          onColumnChange(columns[0].id);
      }
    }
    // Added boardValue and boards dependencies
  }, [columns, columnValue, onColumnChange, boardValue, boards]); 

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
  
  // Combine external disabled state with internal loading state for the button
  const isButtonDisabled = disabled || boardsLoading;

  return (
    <div className={`${className} ${showColumns ? 'space-y-4' : ''}`}>
      <Popover open={open} onOpenChange={setOpen} modal={true}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="flex justify-between w-full"
            disabled={isButtonDisabled} // Use combined disabled state
          >
            {boardsLoading ? ( // Check boardsLoading directly for button content
                <div className="flex items-center">
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    <span>Loading Boards...</span>
                </div>
            ) : selectedBoard ? (
              <div className="flex items-center gap-2">
                <Layout className="h-4 w-4 text-muted-foreground" />
                <span>{selectedBoard.name}</span>
              </div>
            ) : (
              <span className="text-muted-foreground">Select board</span>
            )}
            {/* Show chevron only when not loading */}
            {!boardsLoading && <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />} 
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