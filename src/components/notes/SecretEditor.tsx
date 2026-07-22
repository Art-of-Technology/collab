"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Plus,
  Download,
  Copy,
  FileCode,
  List,
  Lock,
  AlertTriangle,
  Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { SecretVariableRow, SecretVariableData } from "./SecretVariableRow";

type EditorMode = "key-value" | "raw";

interface SecretEditorProps {
  variables: SecretVariableData[];
  rawContent: string;
  mode: EditorMode;
  isRestricted: boolean;
  expiresAt: string | null;
  onChange: (data: {
    variables?: SecretVariableData[];
    rawContent?: string;
    mode?: EditorMode;
    isRestricted?: boolean;
    expiresAt?: string | null;
  }) => void;
  onCopyLog?: (key?: string, copyAll?: boolean) => void;
  disabled?: boolean;
  noteId?: string; // For existing notes - enables export
  workspaceSlug?: string;
}

/**
 * SecretEditor - Two-mode editor for environment variables and secrets
 *
 * Key-Value Mode: Table-like view with individual key-value pairs
 * Raw Mode: Plain text editor for .env format
 */
export function SecretEditor({
  variables,
  rawContent,
  mode,
  isRestricted,
  expiresAt,
  onChange,
  onCopyLog,
  disabled = false,
  noteId,
  workspaceSlug
}: SecretEditorProps) {
  const [localMode, setLocalMode] = useState<EditorMode>(mode);
  const { toast } = useToast();

  // Sync local mode with prop
  useEffect(() => {
    setLocalMode(mode);
  }, [mode]);

  // Add a new empty variable
  const handleAddVariable = useCallback(() => {
    const newVariable: SecretVariableData = {
      key: "",
      value: "",
      masked: true
    };
    onChange({ variables: [...variables, newVariable] });
  }, [variables, onChange]);

  // Update a variable at index
  const handleUpdateVariable = useCallback(
    (index: number, updates: Partial<SecretVariableData>) => {
      const newVariables = [...variables];
      newVariables[index] = { ...newVariables[index], ...updates };
      onChange({ variables: newVariables });
    },
    [variables, onChange]
  );

  // Delete a variable at index
  const handleDeleteVariable = useCallback(
    (index: number) => {
      const newVariables = variables.filter((_, i) => i !== index);
      onChange({ variables: newVariables });
    },
    [variables, onChange]
  );

  // Handle copy logging
  const handleCopy = useCallback(
    (key: string) => {
      if (onCopyLog) {
        onCopyLog(key, false);
      }
    },
    [onCopyLog]
  );

  // Copy all as .env format
  const handleCopyAll = useCallback(async () => {
    try {
      let content: string;

      if (localMode === "key-value") {
        content = variables
          .filter((v) => v.key.trim())
          .map((v) => {
            const needsQuotes = /[\s#=]/.test(v.value);
            const value = needsQuotes ? `"${v.value}"` : v.value;
            return `${v.key}=${value}`;
          })
          .join("\n");
      } else {
        content = rawContent;
      }

      await navigator.clipboard.writeText(content);
      toast({
        title: "Copied",
        description: "All secrets copied to clipboard"
      });

      if (onCopyLog) {
        onCopyLog(undefined, true);
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive"
      });
    }
  }, [localMode, variables, rawContent, toast, onCopyLog]);

  // Switch between modes
  const handleModeChange = useCallback(
    (newMode: EditorMode) => {
      if (newMode === localMode) return;

      // Convert between modes
      if (newMode === "raw" && localMode === "key-value") {
        // Key-value to raw
        const content = variables
          .filter((v) => v.key.trim())
          .map((v) => {
            const needsQuotes = /[\s#=]/.test(v.value);
            const value = needsQuotes ? `"${v.value}"` : v.value;
            return `${v.key}=${value}`;
          })
          .join("\n");
        onChange({ rawContent: content, mode: newMode });
      } else if (newMode === "key-value" && localMode === "raw") {
        // Raw to key-value
        const lines = rawContent.split("\n");
        const newVariables: SecretVariableData[] = [];

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;

          const equalIndex = trimmed.indexOf("=");
          if (equalIndex === -1) continue;

          const key = trimmed.substring(0, equalIndex).trim();
          let value = trimmed.substring(equalIndex + 1).trim();

          // Remove surrounding quotes
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }

          if (key) {
            newVariables.push({ key, value, masked: true });
          }
        }

        onChange({ variables: newVariables, mode: newMode });
      }

      setLocalMode(newMode);
    },
    [localMode, variables, rawContent, onChange]
  );

  // Handle raw content change
  const handleRawContentChange = useCallback(
    (content: string) => {
      onChange({ rawContent: content });
    },
    [onChange]
  );

  // Handle restricted change
  const handleRestrictedChange = useCallback(
    (restricted: boolean) => {
      onChange({ isRestricted: restricted });
    },
    [onChange]
  );

  // Handle expiration change
  const handleExpirationChange = useCallback(
    (date: string) => {
      onChange({ expiresAt: date || null });
    },
    [onChange]
  );

  // Export secrets
  const handleExport = useCallback(
    (format: "env" | "json") => {
      if (!noteId) return;

      // Open export URL in new tab
      const url = `/api/notes/${noteId}/secrets/export?format=${format}`;
      window.open(url, "_blank");
    },
    [noteId]
  );

  return (
    <div className="space-y-4">
      {/* Mode Toggle and Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 bg-collab-900 border border-collab-700 rounded-lg p-0.5">
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleModeChange("key-value")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors h-auto",
              localMode === "key-value"
                ? "bg-collab-700 text-collab-50"
                : "text-collab-500 hover:text-collab-400"
            )}
          >
            <List className="h-3 w-3" />
            Key-Value
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleModeChange("raw")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors h-auto",
              localMode === "raw"
                ? "bg-collab-700 text-collab-50"
                : "text-collab-500 hover:text-collab-400"
            )}
          >
            <FileCode className="h-3 w-3" />
            Raw .env
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCopyAll}
            disabled={disabled}
            className="h-7 text-collab-500 hover:text-collab-50"
          >
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Copy All
          </Button>

          {noteId && (
            <div className="flex items-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleExport("env")}
                className="h-7 text-collab-500 hover:text-collab-50 rounded-r-none"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                .env
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleExport("json")}
                className="h-7 text-collab-500 hover:text-collab-50 rounded-l-none border-l border-collab-600"
              >
                .json
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Editor Content */}
      {localMode === "key-value" ? (
        <div className="space-y-2">
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {variables.map((variable, index) => (
              <SecretVariableRow
                key={index}
                variable={variable}
                index={index}
                onUpdate={handleUpdateVariable}
                onDelete={handleDeleteVariable}
                onCopy={handleCopy}
                disabled={disabled}
              />
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddVariable}
            disabled={disabled}
            className="w-full h-9 border-dashed border-collab-600 text-collab-500 hover:text-collab-50 hover:border-collab-600"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Variable
          </Button>
        </div>
      ) : (
        <Textarea
          value={rawContent}
          onChange={(e) => handleRawContentChange(e.target.value)}
          placeholder={"# Environment Variables\nDATABASE_URL=postgres://...\nAPI_KEY=sk-..."}
          disabled={disabled}
          className={cn(
            "min-h-[300px] font-mono text-sm",
            "bg-collab-900 border-collab-700 text-collab-50",
            "placeholder:text-collab-500/60",
            "focus:border-blue-500 focus:ring-0"
          )}
        />
      )}

      {/* Security Options */}
      <div className="flex flex-col gap-4 pt-4 border-t border-collab-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-collab-500" />
            <div>
              <Label htmlFor="restricted" className="text-sm text-collab-50">
                Restricted Access
              </Label>
              <p className="text-xs text-collab-500">
                Require explicit sharing even for project/workspace scope
              </p>
            </div>
          </div>
          <Switch
            id="restricted"
            checked={isRestricted}
            onCheckedChange={handleRestrictedChange}
            disabled={disabled}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-collab-500" />
            <div>
              <Label htmlFor="expiresAt" className="text-sm text-collab-50">
                Expiration Date
              </Label>
              <p className="text-xs text-collab-500">
                Optional: Secret access expires after this date
              </p>
            </div>
          </div>
          <Input
            id="expiresAt"
            type="date"
            value={expiresAt || ""}
            onChange={(e) => handleExpirationChange(e.target.value)}
            disabled={disabled}
            className={cn(
              "w-[180px] h-8",
              "bg-collab-800 border-collab-600 text-collab-50",
              "focus:border-blue-500 focus:ring-0"
            )}
          />
        </div>
      </div>

      {/* Warning for sensitive data */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
        <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-amber-200/80">
          <p className="font-medium text-amber-200">Security Notice</p>
          <p className="mt-0.5">
            Secrets are encrypted at rest using AES-256-GCM. All access is logged for audit
            purposes. Revealed values auto-hide after 30 seconds.
          </p>
        </div>
      </div>
    </div>
  );
}

export default SecretEditor;
