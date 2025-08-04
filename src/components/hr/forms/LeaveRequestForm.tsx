"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { DateRange } from "react-day-picker";
import { useLeavePolicies, useCreateLeaveRequest } from "@/hooks/queries/useLeave";

// Form schema for leave request
const leaveRequestSchema = z.object({
  policyId: z.string({
    required_error: "Please select a leave type.",
  }).min(1, "Please select a leave type."),
  dateRange: z
    .object(
      {
        from: z.date({
          required_error: "Please select a start date.",
        }),
        to: z.date().optional(),
      },
      {
        required_error: "Please select a start date.",
      }
    )
    .refine(
      (data) => {
        // If to date is provided, it must be >= from date
        if (data.to) {
          return data.to >= data.from;
        }
        return true;
      },
      {
        message: "End date must be after or equal to start date",
        path: ["to"],
      }
    ),
  duration: z.enum(["FULL_DAY", "HALF_DAY"]).default("FULL_DAY"),
  notes: z
    .string({
      required_error: "Please add any additional notes for your leave request.",
    })
    .min(1, "Please add any additional notes for your leave request.")
    .max(500, "Notes cannot exceed 500 characters"),
});

export type LeaveRequestFormData = z.infer<typeof leaveRequestSchema>;


export interface LeaveRequestSubmissionData {
  policyId: string;
  startDate: Date;
  endDate: Date;
  duration: "FULL_DAY" | "HALF_DAY";
  notes: string;
}

// Type for leave policy data
export interface LeavePolicy {
  id: string;
  name: string;
  group: string | null;
  isPaid: boolean;
  trackIn: "HOURS" | "DAYS";
}

interface LeaveRequestFormProps {
  workspaceId: string;
  onSubmit?: (data: LeaveRequestSubmissionData) => Promise<void>;
  onCancel: () => void;
  onSuccess?: () => void;
}

export function LeaveRequestForm({
  workspaceId,
  onSubmit,
  onCancel,
  onSuccess,
}: LeaveRequestFormProps) {
  // React Query hooks
  const { 
    data: policies = [], 
    isLoading: isLoadingPolicies,
    error: policiesError 
  } = useLeavePolicies(workspaceId);
  
  const createLeaveRequestMutation = useCreateLeaveRequest(workspaceId);

  const form = useForm<LeaveRequestFormData>({
    resolver: zodResolver(leaveRequestSchema),
    defaultValues: {
      policyId: "",
      dateRange: undefined,
      duration: "FULL_DAY",
      notes: "",
    },
  });

  const resetForm = () => {
    form.reset({
      policyId: "",
      dateRange: undefined,
      duration: "FULL_DAY",
      notes: "",
    });
  };

  const handleSubmit = async (data: LeaveRequestFormData) => {
    // Convert range to startDate/endDate format for submission
    const submissionData: LeaveRequestSubmissionData = {
      policyId: data.policyId,
      startDate: data.dateRange.from,
      endDate: data.dateRange.to || data.dateRange.from, // If no end date, use start date (single day)
      duration: data.duration,
      notes: data.notes,
    };

    try {
      // Use custom onSubmit if provided, otherwise use the mutation
      if (onSubmit) {
        await onSubmit(submissionData);
      } else {
        await createLeaveRequestMutation.mutateAsync(submissionData);
      }

      // Reset form after successful submission
      resetForm();
      
      // Call onSuccess callback if provided
      onSuccess?.();
    } catch (error) {
      // Error handling is managed by React Query for mutations
      // or can be handled by the parent component for custom onSubmit
      console.error("Failed to submit leave request:", error);
    }
  };

  const handleCancel = () => {
    resetForm();
    onCancel();
  };

  const isDateRange = (dateRange: DateRange | undefined) => {
    return (
      dateRange?.from &&
      dateRange?.to &&
      dateRange.from.getTime() !== dateRange.to.getTime()
    );
  };

  // Get loading state - either from mutation or custom submission
  const isSubmitting = createLeaveRequestMutation.isPending;

  // Show error message if policies failed to load
  if (policiesError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load leave policies. Please try again.
          <Button 
            onClick={() => window.location.reload()} 
            variant="outline" 
            size="sm"
            className="ml-2"
          >
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        {createLeaveRequestMutation.error && (
          <Alert variant="destructive">
            <AlertDescription>
              {createLeaveRequestMutation.error.message || "Failed to submit leave request. Please try again."}
            </AlertDescription>
          </Alert>
        )}
        <FormField
          control={form.control}
          name="policyId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Leave Policy</FormLabel>
              <Select 
                onValueChange={field.onChange} 
                defaultValue={field.value}
                disabled={isLoadingPolicies}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue 
                      placeholder={
                        isLoadingPolicies 
                          ? "Loading policies..." 
                          : "Select leave policy"
                      } 
                    />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {policies.map((policy) => (
                    <SelectItem key={policy.id} value={policy.id}>
                      <div className="flex flex-col">
                        <span>{policy.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="dateRange"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Leave Dates</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full pl-3 text-left font-normal",
                        !field.value?.from && "text-muted-foreground"
                      )}
                    >
                      {field.value?.from ? (
                        field.value.to ? (
                          <>
                            {format(field.value.from, "LLL dd, y")} -{" "}
                            {format(field.value.to, "LLL dd, y")}
                          </>
                        ) : (
                          format(field.value.from, "LLL dd, y")
                        )
                      ) : (
                        <span>Pick date range</span>
                      )}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    defaultMonth={field.value?.from}
                    selected={field.value}
                    showOutsideDays={false}
                    onSelect={(range) => {
                      field.onChange(range);
                      // If multi-day range is selected, set duration to full day
                      if (isDateRange(range)) {
                        form.setValue("duration", "FULL_DAY");
                      }
                    }}
                    numberOfMonths={2}
                    disabled={(date) =>
                      date < new Date(new Date().setHours(0, 0, 0, 0))
                    }
                  />
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="duration"
          render={({ field }) => {
            const dateRange = form.watch("dateRange");

            return (
              <FormItem className="space-y-3">
                <FormLabel className="text-base">Leave Duration</FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={field.onChange}
                    value={field.value}
                    className="flex flex-row space-x-6"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="FULL_DAY" id="full-day" />
                      <Label htmlFor="full-day">Full Day</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem
                        value="HALF_DAY"
                        id="half-day"
                        disabled={isDateRange(dateRange)}
                      />
                      <Label
                        htmlFor="half-day"
                        className={
                          isDateRange(dateRange)
                            ? "text-muted-foreground cursor-not-allowed"
                            : ""
                        }
                      >
                        Half Day
                        {isDateRange(dateRange) && (
                          <span className="text-xs text-muted-foreground ml-1">
                            (Not available for date ranges)
                          </span>
                        )}
                      </Label>
                    </div>
                  </RadioGroup>
                </FormControl>
              </FormItem>
            );
          }}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Add any additional notes for your leave request"
                  className="resize-none"
                  {...field}
                  maxLength={500}
                />
              </FormControl>
              <div className="text-xs text-muted-foreground text-right">
                {field.value?.length || 0}/500
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end space-x-2 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Submit Request"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
