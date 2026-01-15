"use client";

import { useState, useMemo, ReactNode } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, Plus, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Generic option type that covers all use cases
export interface FilterOption {
  id: string;
  label: string;
  // For icon-based items (priority, type, status)
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  iconColor?: string; // Tailwind class like "text-red-500" or CSS color
  // For color-based items (labels, projects)
  color?: string; // Hex color like "#6366F1"
  // For avatar-based items (assignees, reporters)
  image?: string | null;
  useCustomAvatar?: boolean;
  // For grouping/prioritization
  isPrioritized?: boolean; // e.g., current user
  priorityLabel?: string; // e.g., "(You)"
  // For additional info display
  suffix?: string; // e.g., "P1", "P2" for priority
  // For disabled state
  disabled?: boolean;
  disabledReason?: string;
}

export type SelectionMode = "single" | "multi";

export interface GlobalFilterSelectorProps {
  // Core props
  value: string | string[];
  onChange: (value: string | string[]) => void;
  options: FilterOption[];

  // Display configuration
  label: string; // e.g., "Assignee", "Priority", "Labels"
  pluralLabel?: string; // e.g., "assignees", "priorities" - defaults to label + "s"
  emptyIcon: React.ComponentType<{ className?: string }>;

  // Behavior configuration
  selectionMode?: SelectionMode; // defaults to "multi"
  showSearch?: boolean; // defaults to false
  searchPlaceholder?: string; // defaults to "Search..."
  allowClear?: boolean; // defaults to true
  clearLabel?: string; // defaults to "Clear {label} filter"

  // Create button configuration
  showCreateButton?: boolean; // defaults to false
  createLabel?: string; // defaults to "Create"
  isCreating?: boolean;
  onCreateClick?: (searchQuery: string) => void;

  // Loading state
  isLoading?: boolean;

  // Styling
  disabled?: boolean;
  popoverWidth?: string; // defaults to "w-56"
  popoverAlign?: "start" | "center" | "end"; // defaults to "start"

  // Custom rendering
  renderTriggerContent?: (selectedOptions: FilterOption[]) => ReactNode;
  renderOptionContent?: (option: FilterOption, isSelected: boolean) => ReactNode;
  renderEmptyState?: () => ReactNode;
  renderNoResults?: (searchQuery: string) => ReactNode;

  // Section headers
  sectionHeader?: string; // e.g., "Team members"
  filterHeader?: string; // e.g., "Filter by assignees"
}

export function GlobalFilterSelector({
  value,
  onChange,
  options,
  label,
  pluralLabel,
  emptyIcon: EmptyIcon,
  selectionMode = "multi",
  showSearch = false,
  searchPlaceholder = "Search...",
  allowClear = true,
  clearLabel,
  showCreateButton = false,
  createLabel = "Create",
  isCreating = false,
  onCreateClick,
  isLoading = false,
  disabled = false,
  popoverWidth = "w-56",
  popoverAlign = "start",
  renderTriggerContent,
  renderOptionContent,
  renderEmptyState,
  renderNoResults,
  sectionHeader,
  filterHeader,
}: GlobalFilterSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Normalize value to always work with arrays internally
  const selectedIds = useMemo(() => {
    if (selectionMode === "single") {
      return value ? [value as string] : [];
    }
    return (value as string[]) || [];
  }, [value, selectionMode]);

  // Get selected options
  const selectedOptions = useMemo(() => {
    return options.filter(opt => selectedIds.includes(opt.id));
  }, [options, selectedIds]);

  // Filter and sort options
  const filteredOptions = useMemo(() => {
    let filtered = options;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = options.filter(opt =>
        opt.label.toLowerCase().includes(query)
      );
    }

    // Separate prioritized items
    const prioritized = filtered.filter(opt => opt.isPrioritized);
    const regular = filtered.filter(opt => !opt.isPrioritized);

    return [...prioritized, ...regular];
  }, [options, searchQuery]);

  // Handle toggle/select
  const handleToggle = (optionId: string) => {
    const option = options.find(opt => opt.id === optionId);
    if (option?.disabled) return;

    if (selectionMode === "single") {
      onChange(optionId);
      setIsOpen(false);
    } else {
      const newValues = selectedIds.includes(optionId)
        ? selectedIds.filter(id => id !== optionId)
        : [...selectedIds, optionId];
      onChange(newValues);
    }
  };

  // Handle clear
  const handleClear = () => {
    if (selectionMode === "single") {
      onChange("");
    } else {
      onChange([]);
    }
  };

  // Compute plural label
  const computedPluralLabel = pluralLabel || `${label.toLowerCase()}s`;
  const computedClearLabel = clearLabel || `Clear ${label.toLowerCase()} filter`;
  const computedFilterHeader = filterHeader || `Filter by ${label.toLowerCase()}`;

  // Default trigger content renderer
  const defaultRenderTriggerContent = () => {
    if (selectedOptions.length === 0) {
      return (
        <>
          <EmptyIcon className="h-3 w-3 text-[#6e7681]" />
          <span className="text-[#6e7681] text-xs">{label}</span>
        </>
      );
    }

    if (selectedOptions.length === 1) {
      const opt = selectedOptions[0];
      return (
        <>
          {renderOptionIcon(opt, "h-3 w-3")}
          <span className="text-[#cccccc] text-xs truncate max-w-[80px]">
            {opt.label}
            {opt.isPrioritized && opt.priorityLabel ? ` ${opt.priorityLabel}` : ""}
          </span>
        </>
      );
    }

    // Multiple selected
    return (
      <>
        <div className="flex items-center -space-x-1">
          {selectedOptions.slice(0, 3).map((opt, index) => (
            <div
              key={opt.id}
              className="relative flex-shrink-0"
              style={{ zIndex: 3 - index }}
            >
              {renderOptionIcon(opt, "h-2.5 w-2.5", true)}
            </div>
          ))}
          {selectedOptions.length > 3 && (
            <div className="h-2.5 w-2.5 rounded-full bg-[#404040] border border-[#181818] flex items-center justify-center">
              <span className="text-[8px] text-white font-medium">+</span>
            </div>
          )}
        </div>
        <span className="text-[#cccccc] text-xs">
          {selectedOptions.length} {computedPluralLabel}
        </span>
      </>
    );
  };

  // Render option icon/indicator based on type
  const renderOptionIcon = (option: FilterOption, sizeClass: string, withBorder = false) => {
    // Color dot (labels, projects)
    if (option.color && !option.icon && !option.image) {
      return (
        <div
          className={cn(
            "rounded-full flex-shrink-0",
            sizeClass,
            withBorder && "border border-[#181818]"
          )}
          style={{ backgroundColor: option.color }}
        />
      );
    }

    // Icon-based (priority, type, status)
    if (option.icon) {
      const Icon = option.icon;
      const colorStyle = option.iconColor?.startsWith("#")
        ? { color: option.iconColor }
        : undefined;
      const colorClass = option.iconColor && !option.iconColor.startsWith("#")
        ? option.iconColor
        : undefined;

      return <Icon className={cn(sizeClass, colorClass)} style={colorStyle} />;
    }

    // Avatar-based (users) - simplified, actual avatar rendering should be custom
    if (option.image !== undefined) {
      return (
        <div
          className={cn(
            "rounded-full bg-[#2a2a2a] flex-shrink-0 flex items-center justify-center text-[8px] font-medium text-white",
            sizeClass,
            withBorder && "border border-[#181818]"
          )}
        >
          {option.label?.charAt(0) || "U"}
        </div>
      );
    }

    return <EmptyIcon className={cn(sizeClass, "text-[#6e7681]")} />;
  };

  // Default option content renderer
  const defaultRenderOptionContent = (option: FilterOption, isSelected: boolean) => {
    return (
      <>
        {renderOptionIcon(option, "h-3.5 w-3.5")}
        <div className="flex flex-col flex-1 min-w-0">
          <span className={cn(
            "text-[#cccccc]",
            option.isPrioritized && "font-medium"
          )}>
            {option.label}
            {option.isPrioritized && option.priorityLabel ? ` ${option.priorityLabel}` : ""}
          </span>
          {option.disabled && option.disabledReason && (
            <span className="text-[10px] text-amber-500">{option.disabledReason}</span>
          )}
        </div>
        {option.suffix && (
          <span className="text-xs text-[#6e7681]">{option.suffix}</span>
        )}
        {isSelected && (
          <Check className="h-3 w-3 text-[#6e7681]" />
        )}
      </>
    );
  };

  return (
    <Popover modal={true} open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors h-auto leading-tight min-h-[20px]",
            "border border-[#2d2d30] hover:border-[#464649] hover:bg-[#1a1a1a]",
            "text-[#cccccc] focus:outline-none bg-[#181818]",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          {renderTriggerContent
            ? renderTriggerContent(selectedOptions)
            : defaultRenderTriggerContent()
          }
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className={cn("p-0 bg-[#1c1c1e] border-[#2d2d30] shadow-xl", popoverWidth)}
        align={popoverAlign}
        side="bottom"
        sideOffset={4}
      >
        {/* Header with optional search */}
        {showSearch ? (
          <div className="p-3 border-b border-[#2d2d30]">
            <div className="text-xs text-[#9ca3af] mb-2 font-medium">
              {computedFilterHeader}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-[#6e7681]" />
              <Input
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-7 text-xs bg-[#0e0e0e] border-[#2d2d30] focus:border-[#464649] text-[#cccccc]"
              />
            </div>
          </div>
        ) : (
          <div className="text-xs text-[#9ca3af] px-2 py-1.5 border-b border-[#2d2d30] font-medium">
            {computedFilterHeader}
          </div>
        )}

        {/* Loading state */}
        {isLoading ? (
          <div className="flex items-center justify-center gap-1.5 py-4">
            <Loader2 className="h-3 w-3 animate-spin text-[#6e7681]" />
            <span className="text-[#6e7681] text-xs">Loading...</span>
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-[#444] scrollbar-track-transparent p-1">
            {/* Clear option */}
            {allowClear && (
              <Button
                type="button"
                variant="ghost"
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#2a2a2a] transition-colors text-left h-auto"
                onClick={handleClear}
              >
                <EmptyIcon className="h-3.5 w-3.5 text-[#6e7681]" />
                <span className="text-[#9ca3af] flex-1">{computedClearLabel}</span>
                {selectedIds.length === 0 && (
                  <Check className="h-3 w-3 text-[#6e7681]" />
                )}
              </Button>
            )}

            {/* Section header */}
            {sectionHeader && filteredOptions.length > 0 && (
              <div className="px-2 pt-2 pb-1 text-xs text-[#6e7681]">
                {sectionHeader}
              </div>
            )}

            {/* Options list */}
            {filteredOptions.length > 0 ? (
              <div className="space-y-0.5">
                {filteredOptions.map((option) => {
                  const isSelected = selectedIds.includes(option.id);
                  return (
                    <Button
                      key={option.id}
                      type="button"
                      variant="ghost"
                      disabled={option.disabled}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded transition-colors text-left h-auto",
                        option.isPrioritized
                          ? "bg-blue-950/20 hover:bg-blue-950/30"
                          : "hover:bg-[#2a2a2a]",
                        option.disabled && "opacity-50 cursor-not-allowed"
                      )}
                      onClick={() => handleToggle(option.id)}
                    >
                      {renderOptionContent
                        ? renderOptionContent(option, isSelected)
                        : defaultRenderOptionContent(option, isSelected)
                      }
                    </Button>
                  );
                })}
              </div>
            ) : searchQuery ? (
              // No results with search
              renderNoResults ? (
                renderNoResults(searchQuery)
              ) : (
                <div className="px-2 py-4 text-center text-[#6e7681] text-xs">
                  <div className="space-y-2">
                    <p>No results for "{searchQuery}"</p>
                    {showCreateButton && onCreateClick && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 h-6 text-xs bg-[#0e0e0e] border-[#2d2d30] hover:bg-[#1a1a1a] text-[#cccccc]"
                        onClick={() => onCreateClick(searchQuery)}
                        disabled={isCreating}
                      >
                        {isCreating ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Plus className="h-3 w-3" />
                        )}
                        {isCreating ? "Creating..." : `${createLabel} "${searchQuery}"`}
                      </Button>
                    )}
                  </div>
                </div>
              )
            ) : (
              // Empty state (no options at all)
              renderEmptyState ? (
                renderEmptyState()
              ) : (
                <div className="px-2 py-4 text-center text-[#6e7681] text-xs">
                  <div className="space-y-2">
                    <p>No {computedPluralLabel} available</p>
                    {showCreateButton && onCreateClick && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 h-6 text-xs bg-[#0e0e0e] border-[#2d2d30] hover:bg-[#1a1a1a] text-[#cccccc]"
                        onClick={() => onCreateClick("")}
                        disabled={isCreating}
                      >
                        {isCreating ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Plus className="h-3 w-3" />
                        )}
                        {isCreating ? "Creating..." : createLabel}
                      </Button>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {/* Clear all footer (when multiple selected) */}
        {selectionMode === "multi" && selectedIds.length > 1 && (
          <div className="border-t border-[#2d2d30] p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-[#6e7681] hover:text-[#cccccc] hover:bg-[#2a2a2a] h-7 text-xs"
              onClick={handleClear}
            >
              <X className="h-3 w-3 mr-2" />
              Clear all {computedPluralLabel}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default GlobalFilterSelector;
