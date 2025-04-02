"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
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
import CreateBoardDialog from "./CreateBoardDialog";

export default function TaskBoardSelector() {
  const [open, setOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const router = useRouter();
  const { boards, selectedBoardId, selectBoard, refreshBoards } = useTasks();

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
            {selectedBoardId
              ? boards.find((board) => board.id === selectedBoardId)?.name
              : "Select board..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[250px] p-0">
          <Command>
            <CommandInput placeholder="Search board..." />
            <CommandEmpty>No board found.</CommandEmpty>
            <CommandGroup>
              {boards.map((board) => (
                <CommandItem
                  key={board.id}
                  value={board.name}
                  onSelect={() => {
                    selectBoard(board.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedBoardId === board.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {board.name}
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
    </div>
  );
} 