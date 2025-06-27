"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useTasks } from "@/context/TasksContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import CreateBoardDialog from "./CreateBoardDialog";
import BoardImportDialog from "./BoardImportDialog";

export default function TaskBoardSelector() {
  const [open, setOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const { boards, selectedBoardId, selectBoard, refreshBoards } = useTasks();
  const { currentWorkspace } = useWorkspace();

  return (
    <div className="flex gap-2 items-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-[250px] justify-between"
          >
            <span className="truncate mr-1">
              {selectedBoardId
                ? boards.find((board) => board.id === selectedBoardId)?.name
                : "Select board..."}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 flex-none" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[250px] p-0">
          <Command>
            <CommandInput placeholder="Search board..." className="border-none focus:ring-0" />
            <CommandEmpty>No board found.</CommandEmpty>
            <CommandGroup className="max-h-[300px] overflow-y-auto">
              {boards.map((board) => (
                <CommandItem
                  key={board.id}
                  value={board.name}
                  onSelect={() => {
                    selectBoard(board.id);
                    setOpen(false);
                  }}
                  className="flex items-center"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 flex-none",
                      selectedBoardId === board.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{board.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup>
              <CommandItem 
                onSelect={() => {
                  setOpen(false);
                  setIsCreateDialogOpen(true);
                }}
                className="text-primary"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create new board
              </CommandItem>
              <CommandItem 
                onSelect={() => {
                  setOpen(false);
                  setIsImportDialogOpen(true);
                }}
                className="text-blue-600"
              >
                <Upload className="mr-2 h-4 w-4" />
                Import from JSON
              </CommandItem>
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
      
      <Button 
        variant="ghost" 
        size="icon" 
        onClick={() => setIsCreateDialogOpen(true)}
        className="h-9 w-9"
      >
        <Plus size={16} />
      </Button>
      
      <CreateBoardDialog 
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onSuccess={() => refreshBoards()}
      />
      
      <BoardImportDialog 
        isOpen={isImportDialogOpen}
        onClose={() => setIsImportDialogOpen(false)}
        onSuccess={(boardId) => {
          refreshBoards();
          selectBoard(boardId);
        }}
        workspaceId={currentWorkspace?.id || ""}
      />
    </div>
  );
} 