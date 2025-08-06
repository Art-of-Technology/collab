// Types that match the Prisma schema for leave management

export type LeaveDuration = "FULL_DAY" | "HALF_DAY";
export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELED";
export type TrackUnit = "HOURS" | "DAYS";
export type AccrualType =
  | "DOES_NOT_ACCRUE"
  | "HOURLY"
  | "FIXED"
  | "REGULAR_WORKING_HOURS";
export type ExportMode =
  | "DO_NOT_EXPORT"
  | "EXPORT_WITH_PAY_CONDITION"
  | "EXPORT_WITH_CODE";
export type RolloverType = "ENTIRE_BALANCE" | "PARTIAL_BALANCE" | "NONE";

// Leave Policy type from Prisma
export interface LeavePolicy {
  id: string;
  name: string;
  group: string | null;
  isPaid: boolean;
  trackIn: TrackUnit;
  isHidden: boolean;
  exportMode: ExportMode;
  exportCode: string | null;
  workspaceId: string;
  accrualType: AccrualType;
  deductsLeave: boolean;
  maxBalance: number | null;
  rolloverType: RolloverType | null;
  rolloverAmount: number | null;
  rolloverDate: Date | null;
  allowOutsideLeaveYearRequest: boolean;
  useAverageWorkingHours: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Simplified policy type for UI components
export interface LeavePolicyOption {
  id: string;
  name: string;
  group: string | null;
  isPaid: boolean;
  trackIn: TrackUnit;
}

// Leave Request type from Prisma
export interface LeaveRequest {
  id: string;
  userId: string;
  policyId: string;
  startDate: Date;
  endDate: Date;
  duration: LeaveDuration;
  notes: string;
  status: LeaveStatus;
  createdAt: Date;
  updatedAt: Date;
  policy?: {
    name: string;
    isPaid: boolean;
    trackIn: TrackUnit;
  };
}

// Extended interface for leave requests with user info (for managers)
export interface LeaveRequestWithUser extends LeaveRequest {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    avatar?: string | null;
    image?: string | null;
  };
}

// Leave Balance type from Prisma
export interface LeaveBalance {
  id: string;
  userId: string;
  policyId: string;
  year: number;
  totalAccrued: number;
  totalUsed: number;
  balance: number;
  rollover: number;
  lastAccruedAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
  policy?: {
    id: string;
    name: string;
    isPaid: boolean;
    trackIn: TrackUnit;
    accrualType: AccrualType;
  };
}

// Type for UI components that display leave balances
export interface LeaveBalanceType {
  policyId: string;
  policyName: string;
  totalAccrued: number;
  totalUsed: number;
  balance: number;
  rollover: number;
  year: number;
  trackUnit: TrackUnit;
  isPaid: boolean;
  accrualType: AccrualType;
}

// Form submission data for creating a leave request
export interface LeaveRequestSubmissionData {
  policyId: string;
  startDate: Date;
  endDate: Date;
  duration: LeaveDuration;
  notes: string;
}

// Form data type for the leave request form
export interface LeaveRequestFormData {
  policyId: string;
  dateRange: {
    from: Date;
    to?: Date;
  };
  duration: LeaveDuration;
  notes: string;
}

// Props for leave-related components
export interface MyLeaveProps {
  workspaceId: string;
  activeRequests?: LeaveRequest[];
  leaveBalances?: LeaveBalanceType[];
  isLoadingBalances?: boolean;
  onSubmitRequest?: (data: LeaveRequestSubmissionData) => Promise<void>;
  isFeatureEnabled?: boolean;
}

export interface LeaveBalanceProps {
  balances?: LeaveBalanceType[];
  isLoading?: boolean;
}

export interface LeaveRequestFormProps {
  workspaceId: string;
  onSubmit?: (data: LeaveRequestSubmissionData) => Promise<void>;
  onCancel: () => void;
  onSuccess?: () => void;
}
