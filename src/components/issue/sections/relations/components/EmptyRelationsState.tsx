"use client";

import { Button } from "@/components/ui/button";
import { Link2, Plus } from "lucide-react";

interface EmptyRelationsStateProps {
  onAddRelation?: () => void;
  canEdit?: boolean;
}

export function EmptyRelationsState({ onAddRelation, canEdit = true }: EmptyRelationsStateProps) {
  return (
    <div className="text-center py-6">
      <Link2 className="h-10 w-10 mx-auto mb-3 text-[#333]" />
      <p className="text-[#ccc] text-sm mb-1">No relations</p>
      <p className="text-[#666] text-xs mb-4">This issue doesn't have any relations yet</p>
      {canEdit && onAddRelation && (
        <Button 
          variant="outline" 
          size="sm"
          className="border-[#333] hover:bg-[#1a1a1a] hover:border-[#444] text-[#ccc]"
          onClick={onAddRelation}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Relation
        </Button>
      )}
    </div>
  );
}
