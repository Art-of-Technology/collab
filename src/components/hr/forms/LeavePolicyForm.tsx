"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CalendarIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import {
  useCreateLeavePolicy,
  useUpdateLeavePolicy,
  type LeavePolicyData,
  type LeavePolicy,
} from "@/hooks/queries/useLeavePolicies";

// Form validation schema
const leavePolicyFormSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name cannot exceed 100 characters"),
  group: z.string().optional(),
  isPaid: z.boolean().default(true),
  trackIn: z.enum(["HOURS", "DAYS"]).default("DAYS"),
  isHidden: z.boolean().default(false),
  exportMode: z
    .enum(["DO_NOT_EXPORT", "EXPORT_WITH_PAY_CONDITION", "EXPORT_WITH_CODE"])
    .default("DO_NOT_EXPORT"),
  exportCode: z.string().optional(),
  accrualType: z.enum(["DOES_NOT_ACCRUE", "HOURLY", "FIXED", "REGULAR_WORKING_HOURS"]).default("FIXED"),
  deductsLeave: z.boolean().default(true),
  maxBalance: z
    .number()
    .positive("Maximum balance must be positive")
    .optional(),
  rolloverType: z
    .enum(["ENTIRE_BALANCE", "PARTIAL_BALANCE", "NONE"])
    .optional(),
  rolloverAmount: z
    .number()
    .positive("Rollover amount must be positive")
    .optional(),
  rolloverDate: z.date().optional(),
  allowOutsideLeaveYearRequest: z.boolean().default(false),
  useAverageWorkingHours: z.boolean().default(false),
});

type FormData = z.infer<typeof leavePolicyFormSchema>;

interface LeavePolicyFormProps {
  workspaceId: string;
  policy?: LeavePolicy;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function LeavePolicyForm({
  workspaceId,
  policy,
  onSuccess,
  onCancel,
}: LeavePolicyFormProps) {
  const isEditing = !!policy;
  const createMutation = useCreateLeavePolicy();
  const updateMutation = useUpdateLeavePolicy();

  const form = useForm<FormData>({
    resolver: zodResolver(leavePolicyFormSchema),
    defaultValues: {
      name: policy?.name || "",
      group: policy?.group || "",
      isPaid: policy?.isPaid ?? true,
      trackIn: policy?.trackIn || "DAYS",
      isHidden: policy?.isHidden ?? false,
      exportMode: policy?.exportMode || "DO_NOT_EXPORT",
      exportCode: policy?.exportCode || "",
      accrualType: policy?.accrualType || "FIXED",
      deductsLeave: policy?.deductsLeave ?? true,
      maxBalance: policy?.maxBalance || undefined,
      rolloverType: policy?.rolloverType || undefined,
      rolloverAmount: policy?.rolloverAmount || undefined,
      rolloverDate: policy?.rolloverDate ? new Date(policy.rolloverDate) : undefined,
      allowOutsideLeaveYearRequest: policy?.allowOutsideLeaveYearRequest ?? false,
      useAverageWorkingHours: policy?.useAverageWorkingHours ?? false,
    },
  });

  const watchedExportMode = form.watch("exportMode");
  const watchedRolloverType = form.watch("rolloverType");

  const onSubmit = async (data: FormData) => {
    try {
      const submitData: LeavePolicyData = {
        ...data,
        group: data.group || null,
        exportCode: data.exportCode || null,
        maxBalance: data.maxBalance || null,
        rolloverType: data.rolloverType || null,
        rolloverAmount: data.rolloverAmount || null,
        rolloverDate: data.rolloverDate ? data.rolloverDate.toISOString() : null,
        workspaceId,
      };

      if (isEditing && policy) {
        await updateMutation.mutateAsync({
          policyId: policy.id,
          data: submitData,
        });
      } else {
        await createMutation.mutateAsync(submitData);
      }

      onSuccess?.();
    } catch (error) {
      // Error handling is done in the hooks
      console.error("Failed to save policy:", error);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Policy Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Annual Leave, Sick Leave"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    A clear, descriptive name for this leave policy
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="group"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Group (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Time Off, Medical, Wellness"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Group similar leave policies together for organization
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="isPaid"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Paid Leave</FormLabel>
                      <FormDescription>
                        Whether this leave type is paid or unpaid
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="trackIn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Track In</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select tracking unit" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="DAYS">Days</SelectItem>
                        <SelectItem value="HOURS">Hours</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Whether to track this leave in days or hours
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Accrual & Balance Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="accrualType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Accrual Type</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select accrual type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                        <SelectItem value="FIXED">Fixed Annual Allocation</SelectItem>
                        <SelectItem value="HOURLY">Hourly Accrual</SelectItem>
                        <SelectItem value="REGULAR_WORKING_HOURS">Regular Working Hours</SelectItem>
                        <SelectItem value="DOES_NOT_ACCRUE">Does Not Accrue</SelectItem>
                      </SelectContent>
                  </Select>
                  <FormDescription>
                    How leave is allocated - fixed amount per year or accumulated over time
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="maxBalance"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Maximum Balance (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="e.g., 28"
                      {...field}
                      onChange={(e) =>
                        field.onChange(
                          e.target.value ? parseFloat(e.target.value) : undefined
                        )
                      }
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormDescription>
                    Maximum amount that can be accrued. Leave blank for no limit.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="deductsLeave"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Deducts Leave</FormLabel>
                    <FormDescription>
                      Whether taking this leave reduces the available balance
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rollover Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="rolloverType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rollover Type</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select rollover type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="NONE">No Rollover</SelectItem>
                      <SelectItem value="ENTIRE_BALANCE">Entire Balance</SelectItem>
                      <SelectItem value="PARTIAL_BALANCE">Partial Balance</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    How unused leave carries over to the next year
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {watchedRolloverType === "PARTIAL_BALANCE" && (
              <FormField
                control={form.control}
                name="rolloverAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rollover Amount</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        step="0.5"
                        placeholder="e.g., 5"
                        {...field}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value ? parseFloat(e.target.value) : undefined
                          )
                        }
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormDescription>
                      Maximum amount that can roll over to next year
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="rolloverDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Rollover Date (Optional)</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) =>
                          date < new Date() || date < new Date("1900-01-01")
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormDescription>
                    Specific date when rollover occurs. Leave blank for year-end.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Export & Advanced Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="exportMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Export Mode</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select export mode" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="DO_NOT_EXPORT">Do Not Export</SelectItem>
                      <SelectItem value="EXPORT_WITH_PAY_CONDITION">
                        Export with Pay Condition
                      </SelectItem>
                      <SelectItem value="EXPORT_WITH_CODE">Export with Code</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    How this leave type appears in payroll exports
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {watchedExportMode === "EXPORT_WITH_CODE" && (
              <FormField
                control={form.control}
                name="exportCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Export Code</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., AL, SL, PH"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Short code used in payroll systems
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="space-y-4">
              <FormField
                control={form.control}
                name="allowOutsideLeaveYearRequest"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        Allow Outside Leave Year Request
                      </FormLabel>
                      <FormDescription>
                        Allow requests outside the current leave year
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="useAverageWorkingHours"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        Use Average Working Hours
                      </FormLabel>
                      <FormDescription>
                        Calculate leave based on average working hours
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isHidden"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Hidden Policy</FormLabel>
                      <FormDescription>
                        Hide this policy from regular users (admin only)
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end space-x-2">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? "Update Policy" : "Create Policy"}
          </Button>
        </div>
      </form>
    </Form>
  );
}