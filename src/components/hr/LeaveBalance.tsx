"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { CalendarDays, Clock } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AnimatedCircularProgressBar } from "@/components/magicui/animated-circular-progress-bar";

export interface LeaveBalanceType {
  policyId: string;
  policyName: string;
  totalAccrued: number;
  totalUsed: number;
  balance: number;
  rollover: number;
  year: number;
  trackUnit: "HOURS" | "DAYS";
  isPaid: boolean;
  accrualType: "DOES_NOT_ACCRUE" | "HOURLY" | "FIXED" | "REGULAR_WORKING_HOURS";
}

interface LeaveBalanceProps {
  balances?: LeaveBalanceType[];
  isLoading?: boolean;
}

export function LeaveBalance({
  balances = [],
}: LeaveBalanceProps) {
  const [selectedLeaveType, setSelectedLeaveType] = useState<string>("");

  // Set initial selected type if not set
  useEffect(() => {
    if (!selectedLeaveType && balances.length > 0) {
      setSelectedLeaveType(balances[0].policyId);
    }
  }, [balances, selectedLeaveType]);

  // Show only the selected leave type
  const currentBalance = balances.find(
    (balance) => balance.policyId === selectedLeaveType
  );

  const formatValue = useCallback((value: number, unit: string) => {
    if (unit === "HOURS") {
      return value === 1 ? `${value} hr` : `${value} hrs`;
    }
    return value === 1 ? `${value} day` : `${value} days`;
  }, []);

  const getAvailableColorHex = useCallback((balance: number, total: number) => {
    const percentage = (balance / total) * 100;
    if (percentage >= 50) return "#16a34a"; // green-600
    if (percentage >= 10) return "#ca8a04"; // yellow-600
    return "#dc2626"; // red-600
  }, []);

  // Handle case when no data is available
  if (balances.length === 0) {
    return (
      <Card className="w-full">
        <CardContent className="p-6 text-center">
          <div className="flex flex-col items-center gap-4">
            <CalendarDays className="h-12 w-12 text-muted-foreground/50" />
            <div>
              <h3 className="font-medium text-muted-foreground">No Leave Data Available</h3>
              <p className="text-sm text-muted-foreground/70">
                Leave balance information will appear here when available.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!currentBalance) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Dropdown for leave type selection */}
      <div className="space-y-2">
        <Select value={selectedLeaveType} onValueChange={setSelectedLeaveType}>
          <SelectTrigger aria-label="Leave type selection" className="w-full">
            <SelectValue placeholder="Select leave type" />
          </SelectTrigger>
          <SelectContent>
            {balances.map((balance) => (
              <SelectItem key={balance.policyId} value={balance.policyId}>
                {balance.policyName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Single leave type card */}
      <Card className="w-full">
        <CardHeader className="p-4 min-h-14">
          <div className="flex justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {currentBalance.trackUnit === "HOURS" ? (
                <Clock className="h-4 w-4 text-muted-foreground" />
              ) : (
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="font-medium text-sm truncate">
                {currentBalance.policyName}
              </span>
              {!currentBalance.isPaid && (
                <Badge variant="outline" className="text-xs w-fit">
                  Unpaid
                </Badge>
              )}
            </div>
            <div className="space-y-1 flex-shrink-0">
              <div className="text-xs text-muted-foreground py-0.5">
                {formatValue(
                  currentBalance.totalAccrued,
                  currentBalance.trackUnit
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 h-full flex flex-col items-center gap-4 min-w-[var(--card-min-width)]">
          {/* Circular Progress Bar */}
          <div>
            <AnimatedCircularProgressBar
              max={currentBalance.totalAccrued}
              value={currentBalance.totalUsed}
              customValue={
                <div className="flex flex-col items-center justify-center gap-1">
                  <div
                    style={{
                      color: getAvailableColorHex(
                        currentBalance.balance,
                        currentBalance.totalAccrued
                      ),
                    }}
                    className={`text-lg font-bold`}
                  >
                    {formatValue(
                      currentBalance.balance,
                      currentBalance.trackUnit
                    )}
                  </div>
                </div>
              }
              min={0}
              gaugePrimaryColor="#3b82f6"
              gaugeSecondaryColor={getAvailableColorHex(
                currentBalance.balance,
                currentBalance.totalAccrued
              )}
              className="size-32"
            />
          </div>

          {/* Usage breakdown */}
          <div className="flex-1 h-full w-full space-y-1">
            <div className="flex flex-col gap-1 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Used: {currentBalance.totalUsed}</span>
              </div>

              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: getAvailableColorHex(
                      currentBalance.balance,
                      currentBalance.totalAccrued
                    ),
                  }}
                ></div>
                <span>Remaining: {currentBalance.balance}</span>
              </div>

            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
