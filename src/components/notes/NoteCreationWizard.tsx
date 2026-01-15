"use client";

import { useState, useMemo } from "react";
import { NoteType, NoteScope } from "@prisma/client";
import {
  NOTE_TYPE_CATEGORIES,
  NOTE_TYPE_CONFIGS,
  NOTE_SCOPE_CONFIGS,
  isSecretNoteType,
} from "@/lib/note-types";
import { useProjects } from "@/hooks/queries/useProjects";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  Lock,
  Users,
  FolderKanban,
  Globe,
  Shield,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface NoteCreationWizardProps {
  workspaceId: string;
  onComplete: (config: {
    type: NoteType;
    scope: NoteScope;
    projectId: string | null;
  }) => void;
  onCancel: () => void;
}

type WizardStep = "type" | "scope" | "project";

export function NoteCreationWizard({
  workspaceId,
  onComplete,
  onCancel,
}: NoteCreationWizardProps) {
  const [step, setStep] = useState<WizardStep>("type");
  const [selectedType, setSelectedType] = useState<NoteType | null>(null);
  const [selectedScope, setSelectedScope] = useState<NoteScope | null>(null);
  const [projectSearch, setProjectSearch] = useState("");

  const { data: projects = [], isLoading: isLoadingProjects } = useProjects({
    workspaceId,
  });

  const filteredProjects = useMemo(() => {
    if (!projectSearch) return projects;
    const search = projectSearch.toLowerCase();
    return projects.filter((p) => p.name.toLowerCase().includes(search));
  }, [projects, projectSearch]);

  const isSecretType = selectedType ? isSecretNoteType(selectedType) : false;

  const availableScopes = useMemo(() => {
    const allScopes = [
      NoteScope.PERSONAL,
      NoteScope.PROJECT,
      NoteScope.WORKSPACE,
      NoteScope.PUBLIC,
    ];
    if (isSecretType) {
      return allScopes.filter((s) => s !== NoteScope.PUBLIC);
    }
    return allScopes;
  }, [isSecretType]);

  const handleTypeSelect = (type: NoteType) => {
    setSelectedType(type);
    const config = NOTE_TYPE_CONFIGS[type];
    setSelectedScope(config.defaultScope);
    setStep("scope");
  };

  const handleScopeSelect = (scope: NoteScope) => {
    setSelectedScope(scope);
    if (scope === NoteScope.PROJECT) {
      setStep("project");
    } else if (selectedType) {
      onComplete({ type: selectedType, scope, projectId: null });
    }
  };

  const handleProjectSelect = (projectId: string) => {
    if (selectedType && selectedScope) {
      onComplete({ type: selectedType, scope: selectedScope, projectId });
    }
  };

  const handleBack = () => {
    if (step === "project") {
      setStep("scope");
    } else if (step === "scope") {
      setStep("type");
      setSelectedScope(null);
    }
  };

  const scopeIcons: Record<NoteScope, typeof Lock> = {
    [NoteScope.PERSONAL]: Lock,
    [NoteScope.SHARED]: Users,
    [NoteScope.PROJECT]: FolderKanban,
    [NoteScope.WORKSPACE]: Users,
    [NoteScope.PUBLIC]: Globe,
  };

  const scopeDescriptions: Record<NoteScope, string> = {
    [NoteScope.PERSONAL]: "Private to you, can be shared with specific people",
    [NoteScope.SHARED]: "Shared with specific users",
    [NoteScope.PROJECT]: "All project members can access",
    [NoteScope.WORKSPACE]: "Everyone in the workspace can view",
    [NoteScope.PUBLIC]: "Publicly accessible to anyone",
  };

  return (
    <div className="h-full flex flex-col p-4">
      {/* Back button & Breadcrumb */}
      {step !== "type" && (
        <div className="flex-none flex items-center gap-2 mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="h-6 px-2 text-[#6e7681] hover:text-[#e6edf3] group"
          >
            <ChevronLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
            Back
          </Button>
          <span className="text-[#3f3f46]">/</span>
          <span className="text-xs text-[#6e7681]">
            {step === "scope" && "Choose visibility"}
            {step === "project" && "Select project"}
          </span>
        </div>
      )}

      {/* Type Selection */}
      {step === "type" && (
        <div className="flex-1 flex flex-col space-y-4 overflow-auto">
          {NOTE_TYPE_CATEGORIES.map((category) => (
            <div key={category.id}>
              {/* Category Header */}
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-[11px] font-semibold text-[#8b949e] uppercase tracking-wider">
                  {category.label}
                </h3>
                {category.id === "secrets" && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[9px] font-medium">
                    <Shield className="h-2.5 w-2.5" />
                    Encrypted
                  </span>
                )}
                <div className="flex-1 h-px bg-[#1f1f1f]" />
              </div>

              {/* Type Cards */}
              <div className="rounded-lg border border-[#1f1f1f] overflow-hidden divide-y divide-[#1f1f1f]">
                {category.types.map((type) => {
                  const config = NOTE_TYPE_CONFIGS[type];
                  const Icon = config.icon;
                  return (
                    <button
                      key={type}
                      onClick={() => handleTypeSelect(type)}
                      className="group w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gradient-to-r hover:from-[#151518] hover:to-transparent transition-all duration-200 cursor-pointer text-left"
                    >
                      {/* Icon */}
                      <div className="w-7 h-7 rounded-md bg-[#1a1a1b] group-hover:bg-[#1f1f1f] flex items-center justify-center flex-shrink-0 transition-colors">
                        <Icon className={cn("h-3.5 w-3.5", config.color)} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-[13px] font-medium text-[#fafafa] group-hover:text-white truncate">
                          {config.label}
                        </h3>
                        <p className="text-[11px] text-[#52525b] truncate">
                          {config.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Cancel link */}
          <div className="pt-1">
            <Button
              variant="link"
              size="sm"
              onClick={onCancel}
              className="h-6 px-0 text-[#6e7681] hover:text-[#e6edf3] no-underline hover:no-underline"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Scope Selection */}
      {step === "scope" && selectedType && (
        <div className="flex-1 flex flex-col space-y-4">
          {/* Selected Type Summary */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-[#0d0d0e] border border-[#1f1f1f]">
            {(() => {
              const config = NOTE_TYPE_CONFIGS[selectedType];
              const Icon = config.icon;
              return (
                <>
                  <div className="w-8 h-8 rounded-lg bg-[#1a1a1b] flex items-center justify-center">
                    <Icon className={cn("h-4 w-4", config.color)} />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-[#e6edf3]">{config.label}</p>
                    <p className="text-[11px] text-[#6e7681]">Now choose who can access this content</p>
                  </div>
                </>
              );
            })()}
          </div>

          {isSecretType && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Shield className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
              <span className="text-[11px] text-amber-200">
                Secrets are encrypted at rest. Public visibility is not available.
              </span>
            </div>
          )}

          {/* Scope Cards */}
          <div className="rounded-lg border border-[#1f1f1f] overflow-hidden divide-y divide-[#1f1f1f]">
            {availableScopes.map((scope) => {
              const config = NOTE_SCOPE_CONFIGS[scope];
              const Icon = scopeIcons[scope];
              const isDefault = NOTE_TYPE_CONFIGS[selectedType].defaultScope === scope;

              return (
                <button
                  key={scope}
                  onClick={() => handleScopeSelect(scope)}
                  className="group w-full flex items-center gap-3 px-4 py-3 hover:bg-gradient-to-r hover:from-[#151518] hover:to-transparent transition-all duration-200 cursor-pointer text-left"
                >
                  {/* Icon */}
                  <div className="w-7 h-7 rounded-md bg-[#1a1a1b] group-hover:bg-[#1f1f1f] flex items-center justify-center flex-shrink-0 transition-colors">
                    <Icon className={cn("h-3.5 w-3.5", config.color)} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[13px] font-medium text-[#fafafa] group-hover:text-white truncate">
                        {config.label}
                      </h3>
                      {isDefault && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#3b82f6]/10 text-[#3b82f6] font-medium">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#52525b] truncate">
                      {scopeDescriptions[scope]}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Project Selection */}
      {step === "project" && (
        <div className="flex-1 flex flex-col space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#6e7681]" />
            <Input
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
              placeholder="Search projects..."
              className="pl-9 h-8 text-[13px] bg-[#0d0d0e] border-[#1f1f1f] text-[#e6edf3] placeholder:text-[#52525b] focus:border-[#30363d]"
            />
          </div>

          {/* Project List */}
          <div className="flex-1 min-h-0 rounded-lg border border-[#1f1f1f] overflow-hidden flex flex-col">
            {isLoadingProjects ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="h-4 w-4 border-2 border-[#3f3f46] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <FolderKanban className="h-6 w-6 text-[#3f3f46] mb-2" />
                <p className="text-[12px] text-[#6e7681]">
                  {projectSearch ? "No projects found" : "No projects available"}
                </p>
                {projectSearch && (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setProjectSearch("")}
                    className="h-5 px-0 text-[11px]"
                  >
                    Clear search
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                <div className="divide-y divide-[#1f1f1f]">
                  {filteredProjects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => handleProjectSelect(project.id)}
                      className="group w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gradient-to-r hover:from-[#151518] hover:to-transparent transition-all duration-200 cursor-pointer text-left"
                    >
                      {/* Color indicator */}
                      <div
                        className="w-1 h-6 rounded-full flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
                        style={{ backgroundColor: project.color || "#6366f1" }}
                      />

                      {/* Project name */}
                      <h3 className="text-[13px] font-medium text-[#fafafa] group-hover:text-white truncate flex-1">
                        {project.name}
                      </h3>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
