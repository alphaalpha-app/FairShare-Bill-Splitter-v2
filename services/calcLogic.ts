import { Bill, BillManualOverride, CalculationResult, Tenant } from '../types';
import { parseISO, isWithinInterval, startOfDay } from 'date-fns';

export function calculateBill(
  bill: Bill,
  tenants: Tenant[],
  overrides: BillManualOverride | undefined
): CalculationResult[] {
  const results: CalculationResult[] = [];
  const tenantIds = bill.includedTenantIds;
  const numberOfTenants = tenantIds.length;

  // 1. Calculate Supply & Sewerage (Equal Split)
  const supplyPerTenant = numberOfTenants > 0 ? bill.supplyCost / numberOfTenants : 0;
  const seweragePerTenant = numberOfTenants > 0 ? bill.sewerageCost / numberOfTenants : 0;

  // Helper to check if a stay date (YYYY-MM-DD string) is within a period
  const isDateInPeriod = (dateStr: string, periodStart: string, periodEnd: string) => {
    // Compare as strings directly for ISO dates (YYYY-MM-DD) to avoid timezone/time-of-day issues
    // This assumes all inputs are strictly YYYY-MM-DD
    return dateStr >= periodStart && dateStr <= periodEnd;
  };

  // 2. Pre-calculate total stay days for each period across ALL tenants
  const periodTotalDays = new Map<string, number>();

  bill.periods.forEach(period => {
    let totalDaysInPeriod = 0;
    tenantIds.forEach(tId => {
      const tenant = tenants.find(t => t.id === tId);
      const tenantDates = tenant?.defaultStayDates || [];
      
      const daysInPeriod = tenantDates.filter(d => 
        isDateInPeriod(d, period.startDate, period.endDate)
      ).length;
      
      totalDaysInPeriod += daysInPeriod;
    });
    periodTotalDays.set(period.id, totalDaysInPeriod);
  });

  // 3. Calculate for each tenant
  tenantIds.forEach(tId => {
    const tenant = tenants.find(t => t.id === tId);
    const tenantDates = tenant?.defaultStayDates || [];
    
    let totalUsageCost = 0;
    const periodBreakdown: { periodId: string; stayDays: number; usageCost: number }[] = [];

    bill.periods.forEach(period => {
      const totalDaysAll = periodTotalDays.get(period.id) || 0;
      
      const myDaysInPeriod = tenantDates.filter(d => 
        isDateInPeriod(d, period.startDate, period.endDate)
      ).length;

      let myUsageCost = 0;
      if (totalDaysAll > 0) {
        const costPerDay = period.usageCost / totalDaysAll;
        myUsageCost = costPerDay * myDaysInPeriod;
      }

      totalUsageCost += myUsageCost;
      periodBreakdown.push({
        periodId: period.id,
        stayDays: myDaysInPeriod,
        usageCost: myUsageCost
      });
    });

    const calculatedTotal = totalUsageCost + supplyPerTenant + seweragePerTenant;

    // Check Overrides
    const override = overrides?.overrides[tId];
    let finalTotal = calculatedTotal;
    let finalSupply = supplyPerTenant;
    let finalSewerage = seweragePerTenant;
    let finalUsage = totalUsageCost;
    let isOverridden = false;

    if (override) {
      if (override.total !== undefined) {
        finalTotal = override.total;
        isOverridden = true;
      }
      if (override.supply !== undefined) {
        finalSupply = override.supply;
        isOverridden = true;
      }
      if (override.sewerage !== undefined) {
        finalSewerage = override.sewerage;
        isOverridden = true;
      }
      if (override.usage !== undefined) {
        finalUsage = override.usage;
        isOverridden = true;
      }
      
      // Re-sum if components overridden but not grand total
      if (override.total === undefined && isOverridden) {
        finalTotal = finalUsage + finalSupply + finalSewerage;
      }
    }

    results.push({
      tenantId: tId,
      total: finalTotal,
      supplyShare: finalSupply,
      sewerageShare: finalSewerage,
      periodBreakdown,
      totalUsageCost: finalUsage,
      isOverridden
    });
  });

  return results;
}