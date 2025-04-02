"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Board } from "@/context/TasksContext";

interface BoardSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  board: Board;
  onSubmit: (data: {
    name: string;
    description?: string;
    issuePrefix?: string;
  }) => Promise<void>;
}

export default function BoardSettings({
  isOpen,
  onClose,
  board,
  onSubmit,
}: BoardSettingsProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: board.name,
    description: board.description || "",
    issuePrefix: board.issuePrefix || "",
  });

  // Reset form data when board changes
  if (board.id && board.name !== formData.name && !loading) {
    setFormData({
      name: board.name,
      description: board.description || "",
      issuePrefix: board.issuePrefix || "",
    });
  }

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      return;
    }

    setLoading(true);
    try {
      await onSubmit(formData);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Board Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="boardName">Board Name</Label>
            <Input
              id="boardName"
              placeholder="Enter board name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="boardDescription">Description</Label>
            <Textarea
              id="boardDescription"
              placeholder="Enter board description"
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="issuePrefix">Issue ID Prefix</Label>
            <Input
              id="issuePrefix"
              placeholder="e.g. WZB"
              value={formData.issuePrefix}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  issuePrefix: e.target.value,
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              This prefix will be used for task identification (e.g., WZB-123)
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Settings"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 