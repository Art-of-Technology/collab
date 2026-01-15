"use client";

import { useState, useMemo } from "react";
import { NoteType, NoteScope } from "@prisma/client";
import {
  NOTE_TYPE_CATEGORIES,
  NOTE_TYPE_CONFIGS,
  NOTE_SCOPE_CONFIGS,
  isSecretNoteType,
  type NoteTypeCategoryConfig,
} from "@/lib/note-types";
import { useProjects } from "@/hooks/queries/useProjects";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  Users,
  FolderKanban,
  Globe,
  Shield,
  Search,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState("");

  const { data: projects = [], isLoading: isLoadingProjects } = useProjects({
    workspaceId,
  });

  const filteredProjects = useMemo(() => {
    if (!projectSearch) return projects;
    const search = projectSearch.toLowerCase();
    return projects.filter((p) =>
      p.name.toLowerCase().includes(search)
    );
  }, [projects, projectSearch]);

  const isSecretType = selectedType ? isSecretNoteType(selectedType) : false;

  // Available scopes based on type
  const availableScopes = useMemo(() => {
    const allScopes = [
      NoteScope.PERSONAL,
      NoteScope.PROJECT,
      NoteScope.WORKSPACE,
      NoteScope.PUBLIC,
    ];

    // For secret types, don't allow PUBLIC scope
    if (isSecretType) {
      return allScopes.filter((s) => s !== NoteScope.PUBLIC);
    }

    return allScopes;
  }, [isSecretType]);

  const handleTypeSelect = (type: NoteType) => {
    setSelectedType(type);
    // Auto-set scope based on type's default
    const config = NOTE_TYPE_CONFIGS[type];
    setSelectedScope(config.defaultScope);
    setStep("scope");
  };

  const handleScopeSelect = (scope: NoteScope) => {
    setSelectedScope(scope);
    if (scope === NoteScope.PROJECT) {
      setStep("project");
    } else {
      // Complete the wizard
      if (selectedType) {
        onComplete({
          type: selectedType,
          scope,
          projectId: null,
        });
      }
    }
  };

  const handleProjectSelect = (projectId: string) => {
    setSelectedProjectId(projectId);
    if (selectedType && selectedScope) {
      onComplete({
        type: selectedType,
        scope: selectedScope,
        projectId,
      });
    }
  };

  const handleBack = () => {
    if (step === "project") {
      setStep("scope");
      setSelectedProjectId(null);
    } else if (step === "scope") {
      setStep("type");
      setSelectedScope(null);
    }
  };

  const canGoBack = step !== "type";

  return (
    <div className="min-h-[500px] flex flex-col">
      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-2 py-6">
        <StepIndicator
          step={1}
          label="Type"
          isActive={step === "type"}
          isComplete={step !== "type"}
        />
        <div className="w-8 h-px bg-[#27272a]" />
        <StepIndicator
          step={2}
          label="Visibility"
          isActive={step === "scope"}
          isComplete={step === "project"}
        />
        <div className="w-8 h-px bg-[#27272a]" />
        <StepIndicator
          step={3}
          label="Project"
          isActive={step === "project"}
          isComplete={false}
          isOptional={selectedScope !== NoteScope.PROJECT}
        />
      </div>

      {/* Step content */}
      <div className="flex-1 px-6">
        {step === "type" && (
          <TypeSelectionStep
            onSelect={handleTypeSelect}
            selectedType={selectedType}
          />
        )}

        {step === "scope" && selectedType && (
          <ScopeSelectionStep
            selectedType={selectedType}
            availableScopes={availableScopes}
            selectedScope={selectedScope}
            onSelect={handleScopeSelect}
            isSecretType={isSecretType}
          />
        )}

        {step === "project" && (
          <ProjectSelectionStep
            projects={filteredProjects}
            isLoading={isLoadingProjects}
            selectedProjectId={selectedProjectId}
            onSelect={handleProjectSelect}
            searchValue={projectSearch}
            onSearchChange={setProjectSearch}
          />
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-[#1f1f1f]">
        <Button
          variant="ghost"
          onClick={canGoBack ? handleBack : onCancel}
          className="text-[#6e7681] hover:text-[#e6edf3]"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          {canGoBack ? "Back" : "Cancel"}
        </Button>

        {step === "type" && (
          <p className="text-xs text-[#6e7681]">
            Select the type of context you want to create
          </p>
        )}
      </div>
    </div>
  );
}

// Step indicator component
function StepIndicator({
  step,
  label,
  isActive,
  isComplete,
  isOptional,
}: {
  step: number;
  label: string;
  isActive: boolean;
  isComplete: boolean;
  isOptional?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors",
          isComplete && "bg-green-500/20 text-green-400",
          isActive && !isComplete && "bg-blue-500/20 text-blue-400 ring-2 ring-blue-500/30",
          !isActive && !isComplete && "bg-[#27272a] text-[#6e7681]",
          isOptional && !isActive && !isComplete && "opacity-50"
        )}
      >
        {isComplete ? <Check className="h-3.5 w-3.5" /> : step}
      </div>
      <span
        className={cn(
          "text-xs font-medium",
          isActive ? "text-[#e6edf3]" : "text-[#6e7681]",
          isOptional && !isActive && "opacity-50"
        )}
      >
        {label}
      </span>
    </div>
  );
}

// Type selection step
function TypeSelectionStep({
  onSelect,
  selectedType,
}: {
  onSelect: (type: NoteType) => void;
  selectedType: NoteType | null;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-[#e6edf3]">
          What kind of context are you creating?
        </h2>
        <p className="text-sm text-[#6e7681] mt-1">
          Choose a category that best fits your content
        </p>
      </div>

      <ScrollArea className="h-[400px] pr-4">
        <div className="space-y-6">
          {NOTE_TYPE_CATEGORIES.map((category) => (
            <CategorySection
              key={category.id}
              category={category}
              onSelect={onSelect}
              selectedType={selectedType}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// Category section with types
function CategorySection({
  category,
  onSelect,
  selectedType,
}: {
  category: NoteTypeCategoryConfig;
  onSelect: (type: NoteType) => void;
  selectedType: NoteType | null;
}) {
  const isSecretsCategory = category.id === "secrets";

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-medium text-[#e6edf3]">{category.label}</h3>
        {isSecretsCategory && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">
            <Shield className="h-3 w-3" />
            <span className="text-[10px] font-medium">Encrypted</span>
          </div>
        )}
      </div>
      <p className="text-xs text-[#6e7681] mb-3">{category.description}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {category.types.map((type) => {
          const config = NOTE_TYPE_CONFIGS[type];
          const Icon = config.icon;
          const isSelected = selectedType === type;

          return (
            <button
              key={type}
              onClick={() => onSelect(type)}
              className={cn(
                "flex flex-col items-start p-3 rounded-lg border transition-all text-left",
                "hover:border-[#3b82f6]/50 hover:bg-[#3b82f6]/5",
                isSelected
                  ? "border-[#3b82f6] bg-[#3b82f6]/10"
                  : "border-[#27272a] bg-[#0d0d0e]"
              )}
            >
              <div
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center mb-2",
                  isSelected ? "bg-[#3b82f6]/20" : "bg-[#1a1a1b]"
                )}
              >
                <Icon className={cn("h-4 w-4", config.color)} />
              </div>
              <span className="text-sm font-medium text-[#e6edf3]">
                {config.label}
              </span>
              <span className="text-xs text-[#6e7681] mt-0.5 line-clamp-2">
                {config.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Scope selection step
function ScopeSelectionStep({
  selectedType,
  availableScopes,
  selectedScope,
  onSelect,
  isSecretType,
}: {
  selectedType: NoteType;
  availableScopes: NoteScope[];
  selectedScope: NoteScope | null;
  onSelect: (scope: NoteScope) => void;
  isSecretType: boolean;
}) {
  const typeConfig = NOTE_TYPE_CONFIGS[selectedType];

  const scopeIcons: Record<NoteScope, typeof Lock> = {
    [NoteScope.PERSONAL]: Lock,
    [NoteScope.SHARED]: Users,
    [NoteScope.PROJECT]: FolderKanban,
    [NoteScope.WORKSPACE]: Users,
    [NoteScope.PUBLIC]: Globe,
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1a1a1b] mb-4">
          <typeConfig.icon className={cn("h-4 w-4", typeConfig.color)} />
          <span className="text-sm text-[#e6edf3]">{typeConfig.label}</span>
        </div>
        <h2 className="text-xl font-semibold text-[#e6edf3]">
          Who should see this?
        </h2>
        <p className="text-sm text-[#6e7681] mt-1">
          Choose the visibility level for your context
        </p>
      </div>

      {isSecretType && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
          <Shield className="h-4 w-4 shrink-0" />
          <span>
            Secret notes are encrypted and stored securely. Public visibility is not available for secrets.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {availableScopes.map((scope) => {
          const config = NOTE_SCOPE_CONFIGS[scope];
          const Icon = scopeIcons[scope];
          const isSelected = selectedScope === scope;
          const isDefault = typeConfig.defaultScope === scope;

          return (
            <button
              key={scope}
              onClick={() => onSelect(scope)}
              className={cn(
                "flex flex-col items-center p-5 rounded-xl border transition-all",
                "hover:border-[#3b82f6]/50 hover:bg-[#3b82f6]/5",
                isSelected
                  ? "border-[#3b82f6] bg-[#3b82f6]/10"
                  : "border-[#27272a] bg-[#0d0d0e]"
              )}
            >
              <div
                className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center mb-3",
                  isSelected ? "bg-[#3b82f6]/20" : "bg-[#1a1a1b]"
                )}
              >
                <Icon className={cn("h-6 w-6", config.color)} />
              </div>
              <span className="text-sm font-medium text-[#e6edf3]">
                {config.label}
              </span>
              <span className="text-xs text-[#6e7681] mt-1 text-center">
                {config.description}
              </span>
              {isDefault && (
                <span className="text-[10px] text-blue-400 mt-2 px-2 py-0.5 rounded-full bg-blue-500/10">
                  Recommended
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Project selection step
function ProjectSelectionStep({
  projects,
  isLoading,
  selectedProjectId,
  onSelect,
  searchValue,
  onSearchChange,
}: {
  projects: Array<{ id: string; name: string; color?: string }>;
  isLoading: boolean;
  selectedProjectId: string | null;
  onSelect: (projectId: string) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-[#e6edf3]">
          Select a project
        </h2>
        <p className="text-sm text-[#6e7681] mt-1">
          This context will be visible to all project members
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6e7681]" />
        <Input
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search projects..."
          className="pl-10 bg-[#0d0d0e] border-[#27272a] text-[#e6edf3] placeholder:text-[#6e7681]"
        />
      </div>

      <ScrollArea className="h-[300px]">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 border-2 border-[#3f3f46] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-12 text-[#6e7681]">
            {searchValue ? "No projects match your search" : "No projects available"}
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((project) => {
              const isSelected = selectedProjectId === project.id;

              return (
                <button
                  key={project.id}
                  onClick={() => onSelect(project.id)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left",
                    "hover:border-[#3b82f6]/50 hover:bg-[#3b82f6]/5",
                    isSelected
                      ? "border-[#3b82f6] bg-[#3b82f6]/10"
                      : "border-[#27272a] bg-[#0d0d0e]"
                  )}
                >
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: project.color || "#6366f1" }}
                  />
                  <span className="text-sm font-medium text-[#e6edf3]">
                    {project.name}
                  </span>
                  {isSelected && (
                    <Check className="h-4 w-4 text-[#3b82f6] ml-auto" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
