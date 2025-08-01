import { LeaveBalanceType } from "./LeaveBalance";

/**
 * Demo data for HR components - only used in development environment
 */
export const demoLeaveBalances: LeaveBalanceType[] = [
  {
    policyId: "1",
    policyName: "Annual Leave",
    totalAccrued: 25,
    totalUsed: 17,
    balance: 8,
    rollover: 0,
    year: 2025,
    trackUnit: "DAYS",
    isPaid: true,
    accrualType: "FIXED",
  },
  {
    policyId: "2",
    policyName: "Sick Leave",
    totalAccrued: 10,
    totalUsed: 1,
    balance: 9,
    rollover: 0,
    year: 2025,
    trackUnit: "DAYS",
    isPaid: true,
    accrualType: "FIXED",
  },
  {
    policyId: "3",
    policyName: "Personal Leave",
    totalAccrued: 40,
    totalUsed: 8,
    balance: 32,
    rollover: 0,
    year: 2025,
    trackUnit: "HOURS",
    isPaid: false,
    accrualType: "HOURLY",
  },
  {
    policyId: "4",
    policyName: "Compassionate Leave",
    totalAccrued: 3,
    totalUsed: 0,
    balance: 3,
    rollover: 0,
    year: 2025,
    trackUnit: "DAYS",
    isPaid: true,
    accrualType: "DOES_NOT_ACCRUE",
  },
];

// Get demo data only in development environment
export const getDemoData = (): LeaveBalanceType[] => {
  if (process.env.NODE_ENV === "development") {
    return demoLeaveBalances;
  }
  return [];
};
