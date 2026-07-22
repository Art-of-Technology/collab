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
          <EmptyIcon className="h-3.5 w-3.5 text-collab-500" />
          <span className="text-collab-500 text-xs">{label}</span>
        </>
      );
    }

    if (selectedOptions.length === 1) {
      const opt = selectedOptions[0];
      return (
        <>
          {renderOptionIcon(opt, "h-3.5 w-3.5")}
          <span className="text-collab-50 text-xs truncate max-w-[80px]">
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
              {renderOptionIcon(opt, "h-3 w-3", true)}
            </div>
          ))}
          {selectedOptions.length > 3 && (
            <div className="h-3 w-3 rounded-full bg-collab-600 border border-collab-700 flex items-center justify-center">
              <span className="text-[8px] text-collab-400 font-medium">+</span>
            </div>
          )}
        </div>
        <span className="text-collab-50 text-xs">
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
            withBorder && "border border-collab-700"
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
            "rounded-full bg-collab-900 flex-shrink-0 flex items-center justify-center text-[8px] font-medium text-collab-400",
            sizeClass,
            withBorder && "border border-collab-700"
          )}
        >
          {option.label?.charAt(0) || "U"}
        </div>
      );
    }

    return <EmptyIcon className={cn(sizeClass, "text-collab-500")} />;
  };

  // Default option content renderer
  const defaultRenderOptionContent = (option: FilterOption, isSelected: boolean) => {
    return (
      <>
        {renderOptionIcon(option, "h-3.5 w-3.5")}
        <div className="flex flex-col flex-1 min-w-0">
          <span className={cn(
            "text-collab-400",
            option.isPrioritized && "font-medium",
            isSelected && "text-collab-50"
          )}>
            {option.label}
            {option.isPrioritized && option.priorityLabel ? ` ${option.priorityLabel}` : ""}
          </span>
          {option.disabled && option.disabledReason && (
            <span className="text-[10px] text-amber-500">{option.disabledReason}</span>
          )}
        </div>
        {option.suffix && (
          <span className="text-xs text-collab-500">{option.suffix}</span>
        )}
        {isSelected && (
          <Check className="h-3.5 w-3.5 text-blue-400" />
        )}
      </>
    );
  };

  return (
    <Popover modal={true} open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all duration-200 h-8 cursor-pointer select-none",
            "border border-collab-600 hover:border-collab-600 hover:bg-collab-600",
            "text-collab-400 bg-collab-900",
            "outline-none",
            selectedOptions.length > 0 && "border-collab-600 bg-collab-700",
            disabled && "opacity-50 cursor-not-allowed pointer-events-none"
          )}
        >
          {renderTriggerContent
            ? renderTriggerContent(selectedOptions)
            : defaultRenderTriggerContent()
          }
        </div>
      </PopoverTrigger>

      <PopoverContent
        className={cn("p-0 bg-collab-800 border-collab-700 shadow-xl rounded-xl", popoverWidth)}
        align={popoverAlign}
        side="bottom"
        sideOffset={4}
      >
        {/* Header with optional search */}
        {showSearch ? (
          <div className="p-3 border-b border-collab-700">
            <div className="text-xs text-collab-500 mb-2 font-medium">
              {computedFilterHeader}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-collab-500" />
              <Input
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-8 text-xs bg-collab-900 border-collab-700 focus:border-collab-600 text-collab-50 placeholder:text-collab-500 rounded-lg"
              />
            </div>
          </div>
        ) : (
          <div className="text-xs text-collab-500 px-3 py-2.5 border-b border-collab-700 font-medium">
            {computedFilterHeader}
          </div>
        )}

        {/* Loading state */}
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-6">
            <Loader2 className="h-4 w-4 animate-spin text-collab-500" />
            <span className="text-collab-500 text-xs">Loading...</span>
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-collab-700 scrollbar-track-transparent p-1.5">
            {/* Clear option */}
            {allowClear && (
              <Button
                type="button"
                variant="ghost"
                className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-lg hover:bg-collab-700 transition-colors text-left h-auto"
                onClick={handleClear}
              >
                <EmptyIcon className="h-3.5 w-3.5 text-collab-500" />
                <span className="text-collab-500 flex-1">{computedClearLabel}</span>
                {selectedIds.length === 0 && (
                  <Check className="h-3.5 w-3.5 text-blue-400" />
                )}
              </Button>
            )}

            {/* Section header */}
            {sectionHeader && filteredOptions.length > 0 && (
              <div className="px-2.5 pt-2 pb-1 text-xs text-collab-500/60 font-medium">
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
                        "w-full flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-lg transition-colors text-left h-auto",
                        isSelected
                          ? "bg-collab-700"
                          : "hover:bg-collab-700",
                        option.isPrioritized && !isSelected && "bg-blue-500/5 hover:bg-blue-500/10",
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
                <div className="px-2.5 py-6 text-center text-collab-500 text-xs">
                  <div className="space-y-3">
                    <p>No results for "{searchQuery}"</p>
                    {showCreateButton && onCreateClick && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 h-8 text-xs bg-collab-900 border-collab-700 hover:bg-collab-700 hover:border-collab-600 text-collab-400 rounded-lg"
                        onClick={() => onCreateClick(searchQuery)}
                        disabled={isCreating}
                      >
                        {isCreating ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
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
                <div className="px-2.5 py-6 text-center text-collab-500 text-xs">
                  <div className="space-y-3">
                    <p>No {computedPluralLabel} available</p>
                    {showCreateButton && onCreateClick && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 h-8 text-xs bg-collab-900 border-collab-700 hover:bg-collab-700 hover:border-collab-600 text-collab-400 rounded-lg"
                        onClick={() => onCreateClick("")}
                        disabled={isCreating}
                      >
                        {isCreating ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
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
          <div className="border-t border-collab-700 p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-collab-500 hover:text-collab-50 hover:bg-collab-700 h-8 text-xs rounded-lg"
              onClick={handleClear}
            >
              <X className="h-3.5 w-3.5 mr-2" />
              Clear all {computedPluralLabel}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default GlobalFilterSelector;
